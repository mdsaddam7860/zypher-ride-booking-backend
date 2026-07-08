# Ride Booking Backend

Node.js + Express + TypeScript backend for a manual-assignment, long-distance
ride booking flow: riders get a vehicle-typed fare estimate and book a ride in
advance, the app **owner** manually assigns a driver from a dashboard (drivers
can run multiple non-overlapping rides), and the driver accepts/denies, marks
arrival, and runs the trip. Pricing is INR-only, with cash or pay-in-advance
support and a time-based cancellation/refund policy.

## Stack

- **Express** + **TypeScript** (strict mode)
- **PostgreSQL** via **Knex** (query builder + migrations, no ORM magic)
- **Zod** for request validation (schemas double as the TS types for `req.body`)
- **JWT** (`jsonwebtoken`) for auth, **bcryptjs** for password hashing
- Pluggable **mapping service** (Google Directions API, falls back to a
  haversine estimate if no API key is set — so it runs locally with zero
  external dependencies), a **notification service** (persists to a
  `notifications` table + best-effort FCM push, falls back to structured
  logging), and a **mock payment gateway** (swap for Razorpay/Stripe later)

## Project structure

```
src/
├── config/          # typed env config, fails fast on missing required vars
├── db/
│   ├── connection.ts
│   └── migrations/  # one migration per table/change, in dependency order
├── types/           # shared TS interfaces (DB rows, JWT payload, etc.)
├── utils/           # errors, pricing, cancellation policy, contact-info gating,
│                     # geo distance, jwt, response serializers
├── middleware/       # auth (JWT + role guard), zod validation, error handler
├── services/        # business logic — the only layer that talks to `db`
├── validators/       # zod schemas per route group
├── controllers/      # thin HTTP handlers: parse req -> call service -> respond
├── routes/           # express routers, wire middleware + controllers
├── app.ts            # express app assembly
└── server.ts          # entrypoint: verify DB connectivity, then listen
```

Controllers never touch the database directly — everything goes through
`services/`, which is where transactions and business rules live. This keeps
the HTTP layer thin and makes the logic testable without spinning up Express.

**Notification calls always fire *after* a transaction commits, never inside
one** — `notificationService` writes on the plain `db` connection (not a
ride's `trx`), so calling it mid-transaction would try to insert a
`notifications` row referencing a ride the notification's own connection
can't see yet (FK violation on uncommitted data). See the note at the top of
`ride.service.ts`.

## Setup

```bash
npm install
cp .env.example .env    # then fill in DATABASE_URL, JWT_SECRET, etc.
npm run migrate         # runs all migrations against DATABASE_URL
npm run dev             # ts-node-dev, auto-reload
```

Production:

```bash
npm run build
npm start
```

Useful scripts:

| Script | Purpose |
|---|---|
| `npm run dev` | Local dev server with auto-reload |
| `npm run build` / `npm start` | Compile to `dist/` and run |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run migrate` | Apply latest migrations |
| `npm run migrate:rollback` | Roll back the last migration batch |
| `npm run migrate:make -- create_x` | Scaffold a new migration |

There's no seed/owner-creation endpoint on purpose (owners shouldn't be
self-service) — insert the first owner row directly, e.g. via a one-off script
using `bcryptjs.hash()`, or add a guarded seed script before you deploy.

## Auth model

JWT payload is `{ userId, role }` where `role` is `rider | driver | owner`.
Send it as `Authorization: Bearer <token>`.

- `POST /api/auth/register/rider`, `/register/driver` — body: `{ name, email, phone, password }`
- `POST /api/auth/login/rider`, `/login/driver`, `/login/owner` — body: `{ email, password }`

## Pricing & vehicle types

Two vehicle types, each with its own rate card (all INR):

| Vehicle | Base fee | Per km | Per minute |
|---|---|---|---|
| `4_seater` | env `FARE_4SEATER_*` (default ₹80 / ₹14 / ₹1.5) |
| `7_seater` | env `FARE_7SEATER_*` (default ₹120 / ₹19 / ₹2) |

Fare = `baseFee + distanceKm * perKm + durationMinutes * perMinute`, computed
in `utils/pricing.ts` from `config.fare.vehiclePricing`. Rides ≥
`LONG_DISTANCE_THRESHOLD_METERS` (default 20km) are flagged `isLongDistance`
— this is informational only and never blocks booking a shorter (or longer)
trip.

**Vehicle type is locked in at fare-estimate time and copied onto the ride.**
The rider cannot change it after creation (different seat counts break
bookings) — it's simply not part of the ride-update payload for riders. The
**owner** *can* change it via the ride-edit endpoint (see below), since that's
a dispatcher correction, not a rider request.

## API reference

### Fares (auth optional)
- `POST /api/fares` — `{ pickupLocation: {lat,lng}, destination: {lat,lng}, pickupAddress?, destinationAddress?, vehicleType: "4_seater" | "7_seater" }` → fare estimate (`fareId`, `estimatedPrice`, `currency: "INR"`, `distanceMeters`, `durationSeconds`, `isLongDistance`), valid for `FARE_ESTIMATE_TTL_MINUTES`.

### Rides (rider/driver/owner, auth required)
- `POST /api/rides` *(rider)* — `{ fareId, scheduledStartAt, paymentMethod: "cash" | "advance", notes? }` → creates ride, `pending_assignment`. `scheduledStartAt` must be in the future (advance booking). Rejects expired/foreign fares, and rejects if the rider already has an active ride (`409`) — **one active ride per rider**, enforced with a row lock at request time.
- `GET /api/rides/:id` — viewable by the rider on it, the assigned driver, or any owner. Response includes `fare` (visible to all three roles), `billing` (rider/owner only — payment method/status/refund), and `contact` (see Contact info below).
- `GET /api/rides/history` — all rides for the caller (rider/driver: their own; owner: everyone's), newest first. Optional `?status=` filter.
- `PATCH /api/rides/:id/edit` *(owner only)* — `{ pickup?, dropoff?, vehicleType?, notes? }`, at least one field. Only allowed while `pending_assignment`; every change is written to the ride's audit trail.
- `PATCH /api/rides/:id/cancel` — `{ reason? }`, allowed from `pending_assignment` / `driver_assigned` / `driver_accepted`. Applies the refund policy below if the ride was paid in advance.
- `POST /api/rides/:id/pay` *(rider)* — confirms/charges the advance-payment order created at booking time (mock gateway — see Payments below).
- `PATCH /api/rides/:id` *(driver)* — `{ action: "accept" | "deny" }`. Deny releases the ride back to `pending_assignment`.
- `POST /api/rides/:id/arrive` *(driver)* — marks the driver as having reached the pickup point (`driver_accepted` only). Notifies the rider ("Driver has arrived").
- `POST /api/rides/:id/start` *(driver)* — `driver_accepted` → `in_progress`.
- `POST /api/rides/:id/complete` *(driver)* — `in_progress` → `completed`. Cash rides get `paymentStatus` flipped to `paid` here.
- `POST /api/rides/:rideId/assign-driver` *(owner)* — same as `POST /api/owner/rides/:rideId/assign` below, just under the `/rides` path per REST convention. Both are wired to the same logic.
- `GET /api/rides/:rideId/audit` *(owner only)* — chronological audit trail: `[{ id, action, changedBy: {id, role}, changes, at }]`.

### Drivers (driver, auth required)
- `GET /api/drivers/me` — the driver's own profile (no password hash).
- `POST /api/drivers/location` — `{ lat, lng }`, upserts `driver_locations`.
- `POST /api/drivers/status/available` / `/status/offline`.

### Riders (rider, auth required)
- `GET /api/riders/me` — the rider's own profile.

### Owner dashboard (owner, auth required)
- `GET /api/owner/rides/pending`
- `GET /api/owner/rides` — **every** ride (pending/assigned/accepted/in-progress/completed/cancelled), sorted active-work-first then newest-first. Optional `?status=` filter.
- `GET /api/owner/drivers/available`
- `GET /api/owner/drivers/nearby?rideId=...` — available drivers sorted by straight-line distance to the ride's pickup point.
- `POST /api/owner/rides/:rideId/assign` — `{ driverId }`. Transactional with row-level locks on both the ride and driver rows. **A driver may be assigned multiple rides** as long as their scheduled time windows (`scheduled_start_at`–`scheduled_end_at`) don't overlap; overlapping assignment attempts get `409`.
- `GET /api/owner/riders/:riderId` — any rider's profile, for dispatch/support lookups.
- `GET /api/owner/fares` — browse/filter fare estimates. Query: `vehicleType?`, `riderId?`, `bookedOnly?`, `limit` (default 50, max 200), `offset`.
- `GET /api/owner/fares/:fareId` — single fare detail.
- `GET /api/owner/fares/pricing` — current per-vehicle-type rates + long-distance threshold, read from `config` (rates are env-driven, not DB-editable yet).

### Contact info

Every ride response can include a `contact` block:
```json
"contact": { "riderPhone": "+91...", "driverPhone": "+91..." }
```
- **Rider/driver:** only see each other's numbers during the active window
  (`driver_assigned` → `driver_accepted` → `in_progress`) — absent before
  assignment and after the ride ends.
- **Owner:** always sees both numbers once a driver is assigned, regardless
  of ride status (including completed/cancelled), for dispute handling.

Gating logic lives in `utils/contact.ts`, shared by `ride.controller.ts` and
`owner.controller.ts` so behavior can't drift between the two.

## Payments & cancellation

- **Cash** (default): no charge up front. `paymentStatus` is `not_required`
  until the ride completes, then flips to `paid`.
- **Advance**: an order is created in the `payments` table at booking time
  (`paymentStatus: "pending"`). The rider confirms via `POST
  /api/rides/:id/pay`, which calls a **mock payment gateway**
  (`payment.service.ts` — swap `mockCharge`/`mockRefund` for a real provider
  SDK; the rest of the flow doesn't change).
- **Cancellation refund policy** (`utils/cancellation.ts`), based on time
  until `scheduledStartAt`:
  - ≥ 24h before departure: **100%** refund
  - 12–24h before: **75%** refund
  - < 12h before: **50%** refund
  - after departure: **0%** refund
  - Only applies if the ride was `advance`-paid and already `paid`; cash
    rides just cancel with no refund fields.

## Ride state machine

```
pending_assignment → driver_assigned → driver_accepted → in_progress → completed
        │                   │                │
        └── cancelled ──────┴────────────────┘
```

`driver_assigned → pending_assignment` also happens on driver deny (loop-back
handled in `ride.service.ts`). `arrived_at` is set mid-`driver_accepted`
(doesn't change `status` itself, just records the timestamp and fires a
rider notification).

## Notifications

Every status-changing action (assignment, accept/deny, arrive, start,
complete, cancel) writes a row to the `notifications` table and best-effort
pushes via FCM if a device token is configured, falling back to structured
logging (`[notification:stub]`) otherwise — see `notification.service.ts`.
This is a basic in-app alert log today; there's no `GET
/api/notifications` read endpoint yet for a notification-bell UI (flag it if
you want one added).

## Testing

### Jest + Supertest (automated)

Integration tests exercise the app through real HTTP requests against a real
Postgres test database — no mocking of the DB layer, so they catch the same
class of bugs (transaction/locking issues, constraint violations) that only
show up with a real database.

```bash
createdb ride_booking_test               # one-time
cp .env.example .env.test
# edit .env.test: DATABASE_URL=postgres://.../ride_booking_test
npm test
```

`tests/jest.setup.ts` runs migrations once and truncates all tables before
every test, so tests are isolated and order-independent. Coverage includes:
- `tests/rideFlow.test.ts` — full happy path, fare → request → assign → accept → start → complete
- `tests/edgeCases.test.ts` — auth/role guards, validation, expired/foreign fares, driver deny, cancellation rules, and a **concurrency test** that fires two simultaneous assignment requests for the same driver and asserts exactly one wins (200) and the other is rejected (409) — this is what actually proves the `SELECT ... FOR UPDATE` locking works, not just that the code compiles.

Fixtures (`tests/helpers/fixtures.ts`) include `rideRequestBody(fareId, overrides?)`,
which supplies a valid `scheduledStartAt` (~1h out) and `paymentMethod: "cash"`
by default, since both are now required on `POST /api/rides`.

### Postman

Import `postman/ride-booking-backend.postman_collection.json`. It's organized
as: Auth → Driver Goes Online → Fare + Ride Request → Owner Assignment →
Driver Trip Lifecycle → Edge Cases. Each request's test script auto-saves
tokens/IDs into collection variables, so running folders top-to-bottom (or
the whole collection via Collection Runner) chains correctly without manual
copy-paste. Only `baseUrl` needs setting up front (defaults to
`http://localhost:3000`).

### Manual test client (frontend/index.html)

A single-file HTML/vanilla-JS console for poking the API by hand — no build
step, just open it. Open `frontend/index.html` directly in a browser (or
`python3 -m http.server 8080 --directory frontend` and visit
`localhost:8080`). Use the left rail to switch between Rider / Driver / Owner,
each with its own session persisted in `localStorage` so refreshing the page
doesn't log you out. The ride panels render a live state-ladder showing
progress through `pending_assignment → driver_assigned → driver_accepted →
in_progress → completed` (or a cancelled marker).

Typical manual test session: register/login as Driver → send a location →
go available → switch to Rider → get a fare (pick a vehicle type) → request
a ride (pick a scheduled time + payment method) → switch to Owner → log in
(seed one first, see below) → assign the driver from the pending list →
switch to Driver → accept → mark arrived → start → complete.

This is a **test/dev tool, not a production frontend** — no build tooling,
no framework, deliberately disposable. If/when you want a real rider or
driver mobile app, or a production owner dashboard, that's a separate,
properly-scoped frontend project (React Native or a PWA for riders/drivers;
React or Next.js for the owner dashboard is reasonable there, since that one
does benefit from routing, real-time updates via sockets, and component
reuse at production scale).

## Known limitations / follow-ups

- **`GOOGLE_MAPS_API_KEY` placeholder safety**: `config/index.ts` now treats
  obviously-placeholder values (anything matching `your...key`) as unset, so
  copying `.env.example` verbatim can't silently break fare estimation by
  triggering real (and failing) Google API calls. Leave it blank for local
  dev; the haversine fallback in `mapping.service.ts` handles it.
- **Nearby drivers** currently uses in-app haversine distance over all
  `available` drivers. Fine at small scale; move to a PostGIS `ST_DWithin` /
  `ST_Distance` query (or a routing-API ETA) once the driver table grows.
- **Mapping service** falls back to a haversine + fixed-speed estimate when
  `GOOGLE_MAPS_API_KEY` is unset, purely so the app is runnable without a key.
  Set the key for real distance/duration/pricing accuracy.
- **Notifications** persist to `notifications` and log to console/FCM, but
  there's no `GET /api/notifications` endpoint yet for an in-app inbox/bell —
  add one (with a `read`/`unread` toggle) if the frontend needs it.
- **Payments are mocked** (`payment.service.ts`'s `mockCharge`/`mockRefund`).
  Swap in a real gateway (Razorpay/Stripe) before going live — the rest of
  the booking/cancellation/refund flow is already wired around the same
  interface, so this should be a contained change.
- **Pricing rates are env-driven, not DB-editable.** `GET
  /api/owner/fares/pricing` is read-only today. If the owner needs to adjust
  rates without a redeploy, add a `pricing_rules` table + `PUT` endpoint and
  point `utils/pricing.ts` at the DB instead of `config`.
- **No owner self-registration endpoint** by design — see Auth model above.
- Rate limiting on `/api/fares` and `/api/rides` (mentioned in the design doc)
  isn't wired in yet — add `express-rate-limit` on those routers if abuse is
  a concern.
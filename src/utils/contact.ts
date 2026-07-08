import { profileService } from "../services/profile.service";
import { RideRow, RideStatus, Role } from "../types";

// Rider/driver only see each other's numbers during the active window of the
// ride (once a driver is on it, until it wraps up) — not before assignment,
// not after cancellation/completion.
const CONTACT_VISIBLE_STATUSES: RideStatus[] = ["driver_assigned", "driver_accepted", "in_progress"];

/**
 * Builds the `contact` block for a ride response.
 * - Owner: always gets both numbers (if a driver is assigned) regardless of
 *   ride status — needed for dispute handling on old/cancelled/completed rides.
 * - Rider/driver: only see each other's numbers during the active window
 *   (see CONTACT_VISIBLE_STATUSES) — never before assignment or after the
 *   ride has wrapped up.
 */
export async function buildContact(
    ride: RideRow,
    viewerRole: Role
): Promise<{ riderPhone: string; driverPhone: string } | undefined> {
    if (!ride.driver_id) return undefined;
    if (viewerRole !== "owner" && !CONTACT_VISIBLE_STATUSES.includes(ride.status)) {
        return undefined;
    }

    const [rider, driver] = await Promise.all([
        profileService.getRiderById(ride.rider_id),
        profileService.getDriverById(ride.driver_id),
    ]);
    return { riderPhone: rider.phone, driverPhone: driver.phone };
}
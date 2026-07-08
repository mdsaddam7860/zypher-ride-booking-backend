import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("rides", (table) => {
    // Reuses the `vehicle_type` enum type already created by the fares
    // migration (20260706000001) — Postgres enum types are database-global,
    // not per-table, so this must NOT try to create it again.
    table
      .enu("vehicle_type", null, {
        useNative: true,
        enumName: "vehicle_type",
        existingType: true,
      })
      .notNullable()
      .defaultTo("4_seater");

    table.text("notes").nullable();

    // Rider-selected departure time, booked in advance. Defaults to "now" for
    // any pre-existing rows / immediate-booking flows.
    table.timestamp("scheduled_start_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    // Estimated arrival, derived from fare.duration_seconds at request time.
    // Used purely to detect driver double-booking (overlapping time slots).
    table.timestamp("scheduled_end_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());

    table.integer("distance_meters").notNullable().defaultTo(0);
    // Long-distance (>= 20km) is advisory, not enforced — see is_long_distance.
    table.boolean("is_long_distance").notNullable().defaultTo(false);

    table
      .enu("payment_method", ["cash", "advance"], {
        useNative: true,
        enumName: "ride_payment_method",
      })
      .notNullable()
      .defaultTo("cash");

    table
      .enu(
        "payment_status",
        ["not_required", "pending", "paid", "refunded", "partially_refunded", "failed"],
        { useNative: true, enumName: "ride_payment_status" }
      )
      .notNullable()
      .defaultTo("not_required");

    table.decimal("refund_amount", 8, 2).nullable();
  });

  await knex.raw(
    "CREATE INDEX idx_rides_driver_schedule ON rides (driver_id, scheduled_start_at, scheduled_end_at)"
  );
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("rides", (table) => {
    table.dropColumn("vehicle_type");
    table.dropColumn("notes");
    table.dropColumn("scheduled_start_at");
    table.dropColumn("scheduled_end_at");
    table.dropColumn("distance_meters");
    table.dropColumn("is_long_distance");
    table.dropColumn("payment_method");
    table.dropColumn("payment_status");
    table.dropColumn("refund_amount");
  });
  // Do NOT drop `vehicle_type` here — it's owned by the fares migration
  // (20260706000001), which drops it in its own `down()`.
  await knex.raw("DROP TYPE IF EXISTS ride_payment_method");
  await knex.raw("DROP TYPE IF EXISTS ride_payment_status");
}
import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("ride_dispatch_requests", (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("uuid_generate_v4()"));
    table.uuid("ride_id").notNullable().references("id").inTable("rides").onDelete("CASCADE");
    table.uuid("driver_id").notNullable().references("id").inTable("drivers").onDelete("CASCADE");
    // Position in the sequential dispatch queue for this ride (0 = tried first).
    table.integer("sequence").notNullable();
    table.decimal("distance_meters", 10, 2).notNullable();
    table
      .enu("status", ["offered", "accepted", "declined", "expired", "superseded"], {
        useNative: true,
        enumName: "dispatch_request_status",
      })
      .notNullable()
      .defaultTo("offered");
    table.timestamp("offered_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp("expires_at", { useTz: true }).notNullable();
    table.timestamp("responded_at", { useTz: true }).nullable();
    table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  await knex.raw(
    "CREATE INDEX idx_dispatch_requests_ride ON ride_dispatch_requests (ride_id, sequence)"
  );
  await knex.raw(
    "CREATE INDEX idx_dispatch_requests_driver_status ON ride_dispatch_requests (driver_id, status)"
  );
  // At most one *active* ("offered") dispatch request per ride at a time —
  // sequential dispatch means only one driver is ever being asked at once.
  await knex.raw(`
    CREATE UNIQUE INDEX idx_dispatch_requests_one_active_per_ride
    ON ride_dispatch_requests (ride_id)
    WHERE status = 'offered'
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("ride_dispatch_requests");
  await knex.raw("DROP TYPE IF EXISTS dispatch_request_status");
}

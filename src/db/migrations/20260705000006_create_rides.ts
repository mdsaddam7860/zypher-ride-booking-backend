import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("rides", (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("uuid_generate_v4()"));
    table.uuid("rider_id").notNullable().references("id").inTable("riders").onDelete("RESTRICT");
    table
      .uuid("driver_id")
      .nullable()
      .references("id")
      .inTable("drivers")
      .onDelete("SET NULL");
    table.uuid("fare_id").notNullable().references("id").inTable("fares").onDelete("RESTRICT");

    table
      .enu(
        "status",
        [
          "pending_assignment",
          "driver_assigned",
          "driver_accepted",
          "in_progress",
          "completed",
          "cancelled",
        ],
        { useNative: true, enumName: "ride_status" }
      )
      .notNullable()
      .defaultTo("pending_assignment");

    table.decimal("pickup_lat", 9, 6).notNullable();
    table.decimal("pickup_lng", 9, 6).notNullable();
    table.decimal("dropoff_lat", 9, 6).notNullable();
    table.decimal("dropoff_lng", 9, 6).notNullable();

    table.string("cancel_reason", 255).nullable();
    table.string("cancelled_by", 10).nullable(); // 'rider' | 'driver' | 'owner'

    table.timestamp("assigned_at", { useTz: true }).nullable();
    table.timestamp("accepted_at", { useTz: true }).nullable();
    table.timestamp("started_at", { useTz: true }).nullable();
    table.timestamp("completed_at", { useTz: true }).nullable();
    table.timestamp("cancelled_at", { useTz: true }).nullable();
    table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  await knex.raw("CREATE INDEX idx_rides_status ON rides (status)");
  await knex.raw("CREATE INDEX idx_rides_rider_id ON rides (rider_id)");
  await knex.raw("CREATE INDEX idx_rides_driver_id ON rides (driver_id)");
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("rides");
  await knex.raw("DROP TYPE IF EXISTS ride_status");
}

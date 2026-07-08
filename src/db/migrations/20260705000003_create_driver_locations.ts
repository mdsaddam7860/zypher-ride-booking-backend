import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("driver_locations", (table) => {
    table
      .uuid("driver_id")
      .primary()
      .references("id")
      .inTable("drivers")
      .onDelete("CASCADE");
    table.decimal("lat", 9, 6).notNullable();
    table.decimal("lng", 9, 6).notNullable();
    table.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  // Speeds up "find nearby available drivers" queries.
  await knex.raw("CREATE INDEX idx_driver_locations_lat_lng ON driver_locations (lat, lng)");
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("driver_locations");
}

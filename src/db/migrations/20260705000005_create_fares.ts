import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("fares", (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("uuid_generate_v4()"));
    table
      .uuid("rider_id")
      .nullable()
      .references("id")
      .inTable("riders")
      .onDelete("SET NULL");
    table.decimal("pickup_lat", 9, 6).notNullable();
    table.decimal("pickup_lng", 9, 6).notNullable();
    table.text("pickup_address").nullable();
    table.decimal("dropoff_lat", 9, 6).notNullable();
    table.decimal("dropoff_lng", 9, 6).notNullable();
    table.text("dropoff_address").nullable();
    table.integer("distance_meters").notNullable();
    table.integer("duration_seconds").notNullable();
    table.decimal("estimated_price", 8, 2).notNullable();
    table.string("currency", 3).notNullable();
    table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp("expires_at", { useTz: true }).notNullable();
  });

  await knex.raw("CREATE INDEX idx_fares_expires_at ON fares (expires_at)");
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("fares");
}

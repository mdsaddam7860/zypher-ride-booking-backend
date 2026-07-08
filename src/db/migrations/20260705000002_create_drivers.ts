import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("drivers", (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("uuid_generate_v4()"));
    table.string("name", 100).notNullable();
    table.string("email", 255).notNullable().unique();
    table.string("phone", 20).notNullable().unique();
    table.text("password_hash").notNullable();
    table
      .enu("status", ["available", "busy", "offline"], {
        useNative: true,
        enumName: "driver_status",
      })
      .notNullable()
      .defaultTo("offline");
    table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("drivers");
  await knex.raw("DROP TYPE IF EXISTS driver_status");
}

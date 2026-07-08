import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("rides", (table) => {
    // Set when the driver marks themselves as having reached the pickup point.
    table.timestamp("arrived_at", { useTz: true }).nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("rides", (table) => {
    table.dropColumn("arrived_at");
  });
}

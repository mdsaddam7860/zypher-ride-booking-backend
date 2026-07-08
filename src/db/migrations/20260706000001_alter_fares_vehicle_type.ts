import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("fares", (table) => {
    table
      .enu("vehicle_type", ["4_seater", "7_seater"], {
        useNative: true,
        enumName: "vehicle_type",
      })
      .notNullable()
      .defaultTo("4_seater");
  });

  // Currency is now INR-only for this market; keep the column but repoint the default.
  await knex.schema.alterTable("fares", (table) => {
    table.string("currency", 3).notNullable().defaultTo("INR").alter();
  });
  await knex("fares").update({ currency: "INR" });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("fares", (table) => {
    table.dropColumn("vehicle_type");
  });
  await knex.raw("DROP TYPE IF EXISTS vehicle_type");
}

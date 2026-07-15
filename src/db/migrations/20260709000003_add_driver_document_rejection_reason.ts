import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("driver_documents", (table) => {
    // Set when an owner rejects a submission — cleared again on the driver's
    // next resubmission (submit() resets verification state wholesale).
    table.text("rejection_reason").nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("driver_documents", (table) => {
    table.dropColumn("rejection_reason");
  });
}

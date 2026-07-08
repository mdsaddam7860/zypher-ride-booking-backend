import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("notifications", (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("uuid_generate_v4()"));
    table.uuid("recipient_id").notNullable();
    table.string("recipient_role", 10).notNullable();
    table.uuid("ride_id").nullable().references("id").inTable("rides").onDelete("CASCADE");
    table.string("title", 150).notNullable();
    table.text("body").notNullable();
    table.boolean("read").notNullable().defaultTo(false);
    table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  await knex.raw("CREATE INDEX idx_notifications_recipient ON notifications (recipient_id, created_at)");
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("notifications");
}

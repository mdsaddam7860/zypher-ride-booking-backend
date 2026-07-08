import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("ride_audit_log", (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("uuid_generate_v4()"));
    table.uuid("ride_id").notNullable().references("id").inTable("rides").onDelete("CASCADE");
    table.uuid("actor_id").notNullable();
    table.string("actor_role", 10).notNullable();
    table.string("action", 50).notNullable();
    // { field: { from, to } } style diff, or free-form detail for non-field actions.
    table.jsonb("changes").notNullable().defaultTo("{}");
    table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  await knex.raw("CREATE INDEX idx_ride_audit_log_ride_id ON ride_audit_log (ride_id, created_at)");
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("ride_audit_log");
}

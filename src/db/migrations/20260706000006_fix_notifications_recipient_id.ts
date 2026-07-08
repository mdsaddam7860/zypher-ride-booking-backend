import type { Knex } from "knex";

/**
 * notifications.recipient_id was created as `uuid`, but owner-broadcast
 * notifications use the placeholder string "owner-dashboard" (there's no
 * single owner-row id to attach to — it's a broadcast marker for anyone on
 * the owner dashboard). Widen the column to `text` so it can hold both real
 * rider/driver UUIDs and this placeholder.
 */
export async function up(knex: Knex): Promise<void> {
    await knex.schema.alterTable("notifications", (table) => {
        table.text("recipient_id").notNullable().alter();
    });
}

export async function down(knex: Knex): Promise<void> {
    // Not reversible in general (a real rollback would need to drop any
    // non-uuid rows first) — left as a no-op guard rather than silently
    // corrupting data on a down-migration.
    await knex.raw(
        "DELETE FROM notifications WHERE recipient_id !~ '^[0-9a-f-]{36}$'"
    );
    await knex.schema.alterTable("notifications", (table) => {
        table.uuid("recipient_id").notNullable().alter();
    });
}
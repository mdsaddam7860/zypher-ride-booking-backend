import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("payments", (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("uuid_generate_v4()"));
    table.uuid("ride_id").notNullable().references("id").inTable("rides").onDelete("CASCADE");
    table.uuid("rider_id").notNullable().references("id").inTable("riders").onDelete("RESTRICT");
    table.decimal("amount", 8, 2).notNullable();
    table.string("currency", 3).notNullable().defaultTo("INR");
    table
      .enu("status", ["created", "paid", "failed", "refunded", "partially_refunded"], {
        useNative: true,
        enumName: "payment_status",
      })
      .notNullable()
      .defaultTo("created");
    // Mock payment gateway order/txn reference — swap for a real provider's id.
    table.string("provider_ref", 100).notNullable();
    table.decimal("refund_amount", 8, 2).nullable();
    table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  await knex.raw("CREATE INDEX idx_payments_ride_id ON payments (ride_id)");
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("payments");
  await knex.raw("DROP TYPE IF EXISTS payment_status");
}

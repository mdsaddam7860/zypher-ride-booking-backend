import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("rides", (table) => {
    // Rider's explicit choice at booking time — drives whether we
    // auto-dispatch to nearby drivers immediately (now) or leave it for the
    // owner to manually assign later (scheduled). Independent of
    // scheduled_start_at's actual value; the rider picks this deliberately.
    table
      .enu("booking_type", ["now", "scheduled"], {
        useNative: true,
        enumName: "ride_booking_type",
      })
      .notNullable()
      .defaultTo("now");

    // Set when auto-dispatch has exhausted all nearby drivers (or radius/
    // attempts) without an accept, so it's visible why a "now" ride fell
    // back to the owner's manual queue.
    table.boolean("auto_dispatch_exhausted").notNullable().defaultTo(false);
  });

  await knex.raw(
    "CREATE INDEX idx_rides_booking_type_status ON rides (booking_type, status)"
  );
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("rides", (table) => {
    table.dropColumn("booking_type");
    table.dropColumn("auto_dispatch_exhausted");
  });
  await knex.raw("DROP TYPE IF EXISTS ride_booking_type");
}

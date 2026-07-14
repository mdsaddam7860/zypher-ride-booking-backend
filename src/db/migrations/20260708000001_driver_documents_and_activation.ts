import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("drivers", (table) => {
    table.string("profile_photo_url", 500).nullable();
    // Gate on whether the driver can go available / accept / respond to
    // dispatch offers. Derived from driver_documents validity — see
    // driver-document.service.ts, which flips this whenever documents are
    // submitted/verified/expired.
    table.boolean("is_active").notNullable().defaultTo(false);
  });

  await knex.schema.createTable("driver_documents", (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("uuid_generate_v4()"));
    table
      .uuid("driver_id")
      .notNullable()
      .unique()
      .references("id")
      .inTable("drivers")
      .onDelete("CASCADE");

    table.string("aadhar_number", 20).nullable();
    table.string("aadhar_photo_url", 500).nullable();

    table.string("license_number", 50).nullable();
    table.date("license_expiry").nullable();
    table.string("license_photo_url", 500).nullable();

    table.string("vehicle_registration_number", 20).nullable();
    table.string("vehicle_model", 100).nullable();
    table.string("vehicle_photo_url", 500).nullable();

    // Set by an owner/admin review step — documents existing isn't enough,
    // someone has to have checked them. is_valid on drivers is derived from
    // this + license_expiry not having passed.
    table.boolean("is_verified").notNullable().defaultTo(false);
    table.uuid("verified_by").nullable(); // owner id, no FK (owners table exists but keep this loose/audit-only)
    table.timestamp("verified_at", { useTz: true }).nullable();

    table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("driver_documents");
  await knex.schema.alterTable("drivers", (table) => {
    table.dropColumn("profile_photo_url");
    table.dropColumn("is_active");
  });
}

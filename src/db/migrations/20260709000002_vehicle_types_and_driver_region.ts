import type { Knex } from "knex";

// ALTER TYPE ... ADD VALUE cannot run inside the same transaction that later
// uses the new value, and some Postgres versions disallow it in a
// transaction at all — run this migration outside Knex's default
// transaction wrapper.
export const config = { transaction: false };

export async function up(knex: Knex): Promise<void> {
  await knex.raw("ALTER TYPE vehicle_type ADD VALUE IF NOT EXISTS '2_wheeler'");
  await knex.raw("ALTER TYPE vehicle_type ADD VALUE IF NOT EXISTS '3_wheeler'");

  await knex.schema.alterTable("drivers", (table) => {
    // Region/city the driver wants to drive in — self-set, used to filter
    // which drivers an owner sees for a given ride's area. Free-text for now
    // (e.g. "Delhi NCR", "Mumbai"); consider a lookup table if you need
    // strict region matching later.
    table.string("preferred_region", 100).nullable();
  });

  await knex.raw("CREATE INDEX idx_drivers_preferred_region ON drivers (preferred_region)");
}

export async function down(knex: Knex): Promise<void> {
  // Postgres has no ALTER TYPE ... DROP VALUE — reverting the enum values
  // isn't supported. Only the driver column addition is reversible here.
  await knex.schema.alterTable("drivers", (table) => {
    table.dropColumn("preferred_region");
  });
}

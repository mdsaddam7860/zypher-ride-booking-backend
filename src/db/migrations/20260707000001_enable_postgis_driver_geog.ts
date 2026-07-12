import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.raw("CREATE EXTENSION IF NOT EXISTS postgis");

  await knex.schema.alterTable("driver_locations", (table) => {
    table.specificType("geog", "geography(Point, 4326)").nullable();
  });

  // Backfill geog from existing lat/lng, then keep it in sync via trigger so
  // callers don't have to remember to maintain both columns.
  await knex.raw(`
    UPDATE driver_locations
    SET geog = ST_SetSRID(ST_MakePoint(lng, lat), 4326)::geography
    WHERE geog IS NULL
  `);

  await knex.raw(`
    CREATE OR REPLACE FUNCTION driver_locations_sync_geog()
    RETURNS trigger AS $$
    BEGIN
      NEW.geog := ST_SetSRID(ST_MakePoint(NEW.lng, NEW.lat), 4326)::geography;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `);

  await knex.raw(`
    CREATE TRIGGER trg_driver_locations_sync_geog
    BEFORE INSERT OR UPDATE OF lat, lng ON driver_locations
    FOR EACH ROW EXECUTE FUNCTION driver_locations_sync_geog();
  `);

  await knex.raw(
    "CREATE INDEX idx_driver_locations_geog ON driver_locations USING GIST (geog)"
  );
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw("DROP TRIGGER IF EXISTS trg_driver_locations_sync_geog ON driver_locations");
  await knex.raw("DROP FUNCTION IF EXISTS driver_locations_sync_geog");
  await knex.raw("DROP INDEX IF EXISTS idx_driver_locations_geog");
  await knex.schema.alterTable("driver_locations", (table) => {
    table.dropColumn("geog");
  });
  // Not dropping the postgis extension — other objects/migrations may depend on it.
}

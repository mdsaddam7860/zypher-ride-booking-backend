import { db } from "../../src/db/connection";

export async function runMigrations(): Promise<void> {
  await db.migrate.latest({ directory: "./src/db/migrations", extension: "ts" });
}

export async function truncateAll(): Promise<void> {
  await db.raw(
    "TRUNCATE TABLE rides, fares, driver_locations, drivers, riders, owners RESTART IDENTITY CASCADE"
  );
}

export async function closeDb(): Promise<void> {
  await db.destroy();
}

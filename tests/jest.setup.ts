import { runMigrations, truncateAll, closeDb } from "./helpers/db";

beforeAll(async () => {
  await runMigrations();
});

beforeEach(async () => {
  await truncateAll();
});

afterAll(async () => {
  await closeDb();
});

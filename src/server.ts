import { createApp } from "./app";
import { config } from "./config";
import { db } from "./db/connection";
import { logger } from "./utils/logger";
import { initSocketServer } from "./realtime/socket";

async function main(): Promise<void> {
  await db.raw("SELECT 1"); // fail fast if the DB is unreachable
  const app = createApp();

  const httpServer = app.listen(config.port, () => {
    logger.info(`Ride booking backend listening on port ${config.port} (${config.env})`);
  });

  initSocketServer(httpServer);
}

main().catch((err) => {
  logger.error("Failed to start server", { error: err instanceof Error ? err.message : String(err) });
  process.exit(1);
});
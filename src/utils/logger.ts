import fs from "fs";
import path from "path";
import winston from "winston";
import { Logtail } from "@logtail/node";
import { LogtailTransport } from "@logtail/winston";
import { config } from "../config";

const logDir = path.join(process.cwd(), "logs");
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

const { combine, timestamp, errors, printf, colorize, json } = winston.format;

// Human-readable format for local development
const devFormat = combine(
  colorize(),
  timestamp({ format: "HH:mm:ss" }),
  errors({ stack: true }),
  printf(({ level, message, timestamp: ts, stack, ...meta }) => {
    const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : "";
    return `${ts} [${level}]: ${stack ?? message}${metaStr}`;
  })
);

// Structured JSON for anything shipped off-box (files, Better Stack)
const structuredFormat = combine(timestamp(), errors({ stack: true }), json());

const transports: winston.transport[] = [
  new winston.transports.Console({
    format: config.env === "production" ? structuredFormat : devFormat,
  }),
  new winston.transports.File({
    filename: path.join(logDir, "error.log"),
    level: "error",
    format: structuredFormat,
  }),
  new winston.transports.File({
    filename: path.join(logDir, "combined.log"),
    format: structuredFormat,
  }),
];

// Ship logs to Better Stack (Logtail) when a source token is configured.
// Safe to omit in local/dev environments — logger just falls back to
// console + file transports above.
if (config.betterStack.sourceToken) {
  const logtail = new Logtail(config.betterStack.sourceToken, {
    endpoint: config.betterStack.ingestingHost || undefined,
  });
  transports.push(new LogtailTransport(logtail));
}

export const logger = winston.createLogger({
  level: config.env === "production" ? "info" : "debug",
  format: structuredFormat,
  defaultMeta: { service: "ride-booking-backend" },
  transports,
  exitOnError: false,
});

export default logger;

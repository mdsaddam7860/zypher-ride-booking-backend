import path from "path";
import dotenv from "dotenv";

process.env.NODE_ENV = "test";

// Prefer .env.test (a dedicated test database) if present, otherwise fall
// back to .env. Either way, JWT_SECRET/DATABASE_URL must resolve here since
// src/config validates required vars at import time.
dotenv.config({ path: path.resolve(__dirname, "../.env.test") });
dotenv.config({ path: path.resolve(__dirname, "../.env") }); // fills any gaps, won't override existing

process.env.JWT_SECRET = process.env.JWT_SECRET ?? "test-secret-do-not-use-in-prod";

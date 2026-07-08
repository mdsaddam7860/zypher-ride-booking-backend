/**
 * Seeds a single owner account. Run with:
 *   npx ts-node scripts/seed-owner.ts owner@example.com yourpassword
 *
 * There's no public /register/owner endpoint on purpose — owner accounts
 * shouldn't be self-service. Use this script (or your own admin tooling)
 * to create them instead.
 */
import "dotenv/config";
import bcrypt from "bcryptjs";
import { db } from "../src/db/connection";

async function main() {
  const [, , email, password] = process.argv;
  if (!email || !password) {
    console.error("Usage: ts-node scripts/seed-owner.ts <email> <password>");
    process.exit(1);
  }

  const existing = await db("owners").where({ email }).first();
  if (existing) {
    console.error(`Owner with email ${email} already exists (id: ${existing.id})`);
    process.exit(1);
  }

  const password_hash = await bcrypt.hash(password, 10);
  const [row] = await db("owners").insert({ email, password_hash }).returning(["id", "email"]);

  console.log("Owner created:", row);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

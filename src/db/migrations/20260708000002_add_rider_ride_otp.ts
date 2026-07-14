import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("riders", (table) => {
    // Permanent 4-digit OTP tied to the rider's account — driver must enter
    // this (told to them by the rider in person) to start any of that
    // rider's rides. Generated once at registration and never rotates,
    // per the requirement ("permanently associated with the rider's account").
    table.string("ride_otp", 4).nullable();
  });

  // Backfill existing riders with a random 4-digit code.
  await knex.raw(`
    UPDATE riders
    SET ride_otp = LPAD(FLOOR(RANDOM() * 10000)::text, 4, '0')
    WHERE ride_otp IS NULL
  `);

  await knex.schema.alterTable("riders", (table) => {
    table.string("ride_otp", 4).notNullable().alter();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("riders", (table) => {
    table.dropColumn("ride_otp");
  });
}

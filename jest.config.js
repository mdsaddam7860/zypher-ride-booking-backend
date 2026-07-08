/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  rootDir: ".",
  testMatch: ["<rootDir>/tests/**/*.test.ts"],
  setupFiles: ["<rootDir>/tests/env.setup.ts"],
  setupFilesAfterEnv: ["<rootDir>/tests/jest.setup.ts"],
  testTimeout: 20000,
  // Integration tests share one Postgres connection/transaction pool and
  // mutate shared tables — run serially (see also the `--runInBand` npm script).
  maxWorkers: 1,
};

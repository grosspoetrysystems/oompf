/**
 * Drizzle Kit configuration for the OOMPF profile index.
 *
 * Migrations are authored as plain SQL under `./migrations` and applied against
 * a Postgres-compatible database identified by `DATABASE_URL` (a Neon
 * connection string in production). This config is used only by the
 * `drizzle-kit` CLI and is never imported by Worker runtime code.
 */
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/schema.ts",
  out: "./migrations",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "",
  },
});

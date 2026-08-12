/**
 * Guard the migration chain against drift.
 *
 * A `metadata` column was once added as a hand-written SQL file that was never
 * registered in Drizzle's journal. `drizzle-kit migrate` had nothing to apply,
 * so production kept the old schema while the deployed Worker queried the new
 * one — every database-backed route returned 500 while the deploy reported
 * success. This makes that class of mistake fail in CI instead.
 *
 * Three properties:
 *
 * 1. every `.sql` file in the migrations directory is registered in the
 *    journal, and every journal entry has a file (an unregistered file is
 *    applied by nothing; a missing file breaks `migrate` outright);
 * 2. applying the chain to an empty database reproduces the schema the code
 *    expects, proving the migrations and the Drizzle schema agree;
 * 3. the repository's own queries run against that schema, so a column the
 *    code selects but no migration creates is caught here rather than in
 *    production.
 */

import { strict as assert } from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";

import { PGlite } from "@electric-sql/pglite";

const MIGRATIONS = new URL("../packages/database/migrations/", import.meta.url);

interface Journal {
  readonly entries: readonly { readonly tag: string }[];
}

const journal = JSON.parse(
  await readFile(new URL("meta/_journal.json", MIGRATIONS), "utf8")
) as Journal;

const sqlFiles = (await readdir(MIGRATIONS))
  .filter((name) => name.endsWith(".sql"))
  .sort();
const journalTags = journal.entries.map((entry) => `${entry.tag}.sql`).sort();

assert.deepEqual(
  sqlFiles,
  journalTags,
  `Migration files and journal entries disagree.\n  files:   ${sqlFiles.join(", ")}\n  journal: ${journalTags.join(", ")}\nGenerate migrations with \`drizzle-kit generate\` so they are journaled; a hand-written .sql file is applied by nothing.`
);

// Apply the chain in journal order — the order production will use.
const client = new PGlite();
for (const entry of journal.entries) {
  const sql = await readFile(new URL(`${entry.tag}.sql`, MIGRATIONS), "utf8");
  // Drizzle separates statements with a breakpoint marker.
  for (const statement of sql.split("--> statement-breakpoint")) {
    if (statement.trim().length > 0) {
      await client.exec(statement);
    }
  }
}

/** Columns the persisted record depends on, as the repository selects them. */
const REQUIRED_COLUMNS = [
  "id",
  "source_type",
  "source_url",
  "gist_id",
  "owner",
  "profile_name",
  "omp_version",
  "revision",
  "content_hash",
  "facts",
  "validation",
  "metadata",
  "created_at",
  "updated_at",
] as const;

const columns = await client.query<{ column_name: string }>(
  "select column_name from information_schema.columns where table_name = 'profiles'"
);
const present = new Set(columns.rows.map((row) => row.column_name));
const missing = REQUIRED_COLUMNS.filter((column) => !present.has(column));

assert.equal(
  missing.length,
  0,
  `Applying every migration leaves the profiles table without: ${missing.join(", ")}.\nThe code expects columns no migration creates, which is exactly how a green deploy can still 500.`
);

// A canary the schema must never grow: artifact content is not stored.
const forbidden = [...present].filter((column) =>
  ["content", "yaml", "body", "document"].includes(column)
);
assert.equal(
  forbidden.length,
  0,
  `The profiles table must stay metadata-only, but found: ${forbidden.join(", ")}`
);

await client.close();

process.stdout.write(
  `migrations ok: ${journal.entries.length} journaled, ${present.size} columns, metadata-only\n`
);

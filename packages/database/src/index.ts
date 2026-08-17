/**
 * OOMPF metadata/enrichment persistence (Drizzle + Postgres).
 *
 * Worker-safe: this package avoids CLI-only `child_process`/`gh` usage so it
 * can run inside Cloudflare Workers alongside the Astro web app. The runtime
 * database is created over Neon's serverless HTTP driver, which speaks Postgres
 * over `fetch` and therefore runs in a Worker (no Node-only TCP socket). The
 * connection is constructed here at the edge boundary and injected into the
 * driver-agnostic {@link createProfileRepository}, so tests and alternate
 * bindings can supply their own Drizzle database.
 */

import { neon } from "@neondatabase/serverless";
import { VERSION } from "@oompf/core";
import { drizzle } from "drizzle-orm/neon-http";
import type { ProfileDatabase } from "./repository.ts";
import { schema } from "./schema.ts";

/** Marker exposing the shared workspace version this package was built against. */
export const DATABASE_PACKAGE_VERSION = VERSION;

/**
 * Create a Worker-compatible Drizzle database from a Neon connection string.
 * The returned handle is passed to {@link createProfileRepository}.
 */
export function createNeonDatabase(connectionString: string): ProfileDatabase {
  return drizzle(neon(connectionString), {
    schema,
  }) as unknown as ProfileDatabase;
}

export {
  type Cursor,
  createProfileRepository,
  decodeCursor,
  deriveProfileId,
  encodeCursor,
  type Page,
  type ProfileDatabase,
  type ProfileRecord,
  type ProfileRepository,
  type RegisterProfileInput,
  type SourceCheckResult,
  sameStoredValue,
  toValidationMetadata,
  type ValidationInput,
} from "./repository.ts";
export {
  type ProfileInsert,
  type ProfileRow,
  type ProfileValidationMetadata,
  profiles,
  type StoredSecretFinding,
  schema,
} from "./schema.ts";

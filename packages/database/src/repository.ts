/**
 * Profile metadata repository over the Drizzle {@link profiles} table.
 *
 * The repository is the only place that reads or writes indexed profile
 * metadata. It is deliberately driver-agnostic: it takes an already-constructed
 * Drizzle `PgDatabase` and never imports a concrete driver, so the Cloudflare
 * Worker binding can hand it a Neon serverless client and tests can hand it a
 * disposable in-memory Postgres. This keeps the runtime connection injectable.
 *
 * Registration is idempotent per canonical source URL: the same source always
 * resolves to the same stable opaque `id`, re-registering unchanged metadata is
 * a no-op read, and a changed revision or content hash refreshes the current
 * metadata and `updatedAt` while preserving the first-indexed `createdAt`.
 */

import type { ProfileFacts, ProfileMetadata } from "@oompf/core";
import { sha256 } from "@oompf/core";
import { and, desc, eq, ilike, isNull, or, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";

import {
  type ProfileRow,
  type ProfileValidationMetadata,
  profiles,
  type StoredSecretFinding,
} from "./schema.ts";

/** A persisted profile metadata record. */
export type ProfileRecord = ProfileRow;

/**
 * Any Drizzle Postgres database, regardless of the underlying driver. Both the
 * Neon serverless HTTP client and the in-memory Postgres used by tests satisfy
 * this, keeping the repository's connection injectable.
 */
export type ProfileDatabase = PgDatabase<PgQueryResultHKT>;

/**
 * The minimum validation shape the repository accepts. This matches core's
 * `ArtifactValidation` structurally but tolerates extra fields (`document`,
 * `yaml`, `facts`) which are projected away before persistence.
 */
export interface ValidationInput {
  readonly blocking: readonly StoredSecretFinding[];
  readonly byteLength: number;
  readonly errors: readonly string[];
  readonly findings: readonly StoredSecretFinding[];
  readonly hash: string;
  readonly structural: "valid" | "invalid";
  readonly warnings: readonly string[];
}

/** Metadata supplied when registering (or re-registering) a source. */
export interface RegisterProfileInput {
  /** Lowercase hex SHA-256 of the canonical source bytes. */
  readonly contentHash: string;
  /** Normalized, source-derived facts. */
  readonly facts: ProfileFacts;
  /** Opaque Gist identifier when applicable. */
  readonly gistId?: string | null;
  /** Publisher-curated `oompf` metadata (summary, kind, tags, links). */
  readonly metadata: ProfileMetadata;
  /** OMP version the profile targets, when declared. */
  readonly ompVersion?: string | null;
  /** Source owner login, or `null`/omitted when anonymous. */
  readonly owner?: string | null;
  /** Human-facing profile name. */
  readonly profileName: string;
  /** Pinned source revision (git SHA), when known. */
  readonly revision?: string | null;
  /** Origin kind, e.g. `"gist"`. */
  readonly sourceType: string;
  /** Canonical, normalized source URL. */
  readonly sourceUrl: string;
  /** Structural validation results (content fields are stripped). */
  readonly validation: ValidationInput;
}

/** Default cap applied to search results and recency listings. */
export const DEFAULT_SEARCH_LIMIT = 50;
/** Absolute ceiling any requested limit is clamped to. */
export const MAX_SEARCH_LIMIT = 100;

/**
 * Normalize a requested limit to a safe bound: non-finite/missing values fall
 * back to {@link DEFAULT_SEARCH_LIMIT}, and anything above
 * {@link MAX_SEARCH_LIMIT} (or below 1) is clamped.
 */
export function clampLimit(
  limit: number | undefined,
  fallback = DEFAULT_SEARCH_LIMIT,
  max = MAX_SEARCH_LIMIT
): number {
  if (limit === undefined || !Number.isFinite(limit)) {
    return fallback;
  }
  return Math.min(Math.max(1, Math.floor(limit)), max);
}

/** Persistence surface for indexed profile metadata. */
export interface ProfileRepository {
  /** Register a source or refresh its metadata; idempotent per source URL. */
  createOrUpdateProfile(input: RegisterProfileInput): Promise<ProfileRecord>;
  /** Find the record registered for a canonical source URL, if any. */
  findBySource(sourceUrl: string): Promise<ProfileRecord | null>;
  /** Look up a record by its stable opaque id. */
  getProfile(id: string): Promise<ProfileRecord | null>;
  /** Most recently updated records, newest first, capped at `limit`. */
  listRecent(limit?: number): Promise<ProfileRecord[]>;
  /** Free-text search across name, owner, and normalized facts. */
  searchProfiles(query: string, limit?: number): Promise<ProfileRecord[]>;
  /**
   * Soft-delete a profile so it leaves read lookups but its row survives for
   * provenance. Idempotent: marking an already-deleted row again returns it.
   */
  softDeleteProfile(id: string): Promise<ProfileRecord | null>;
}

/**
 * Derive the stable opaque profile id for a canonical source URL. The id is a
 * pure function of the URL, so re-registering the same source always yields the
 * same id without a database round-trip.
 */
export function deriveProfileId(sourceUrl: string): string {
  return `prof_${sha256(sourceUrl).slice(0, 32)}`;
}

/**
 * Project a validation result down to persisted metadata, dropping any parsed
 * document or original YAML bytes so no canonical artifact content is stored.
 */
export function toValidationMetadata(
  input: ValidationInput
): ProfileValidationMetadata {
  return {
    blocking: input.blocking.map((f) => ({
      confidence: f.confidence,
      kind: f.kind,
      path: f.path,
      reason: f.reason,
    })),
    byteLength: input.byteLength,
    errors: [...input.errors],
    findings: input.findings.map((f) => ({
      confidence: f.confidence,
      kind: f.kind,
      path: f.path,
      reason: f.reason,
    })),
    hash: input.hash,
    structural: input.structural,
    warnings: [...input.warnings],
  };
}

/** Escape LIKE wildcards so a query term matches literally. */
function likeTerm(query: string): string {
  const escaped = query.replace(/[\\%_]/g, (char) => `\\${char}`);
  return `%${escaped}%`;
}

/**
 * Stable serialization for comparison: object keys sorted, arrays left in
 * order. Postgres normalizes `jsonb` key order on write, so a value read back
 * rarely matches the key order it was written with. Comparing raw
 * `JSON.stringify` output would therefore report a change on every
 * registration, bumping `updatedAt` for rows nothing touched.
 *
 * The goal is to match what `jsonb` will hold, not to describe the input
 * faithfully. That is why non-finite numbers are deliberately left to collapse
 * to `null` exactly as `JSON.stringify` does on the way in: preserving them here
 * would make the incoming value permanently disagree with the stored one, and
 * the row would be rewritten on every registration forever without ever
 * converging.
 */
function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") {
    // `JSON.stringify(undefined)` returns the value `undefined`, not a string,
    // so this fallback is what makes an `undefined` array member canonicalize to
    // "null" - matching what JSON, and therefore `jsonb`, actually stores.
    // Without it a hole in an array would never compare equal to the stored
    // `null` and the row would be rewritten on every registration.
    return JSON.stringify(value) ?? "null";
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonical).join(",")}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([key, v]) => `${JSON.stringify(key)}:${canonical(v)}`);
  return `{${entries.join(",")}}`;
}

/**
 * Whether a stored column already holds the value registration would write.
 *
 * Exported so test doubles standing in for this repository can share the real
 * comparison instead of approximating it. A fake that compares differently is a
 * fake that hides the bug you are testing for.
 */
export function sameStoredValue(stored: unknown, incoming: unknown): boolean {
  if (stored === incoming) {
    return true;
  }
  if (
    stored === null ||
    incoming === null ||
    typeof stored !== "object" ||
    typeof incoming !== "object"
  ) {
    return false;
  }
  return canonical(stored) === canonical(incoming);
}

/**
 * Build a {@link ProfileRepository} backed by the injected Drizzle database.
 */
export function createProfileRepository(
  db: ProfileDatabase
): ProfileRepository {
  async function findBySource(
    sourceUrl: string
  ): Promise<ProfileRecord | null> {
    const rows = await db
      .select()
      .from(profiles)
      .where(and(eq(profiles.sourceUrl, sourceUrl), isNull(profiles.deletedAt)))
      .limit(1);
    return rows[0] ?? null;
  }

  async function getProfile(id: string): Promise<ProfileRecord | null> {
    const rows = await db
      .select()
      .from(profiles)
      .where(and(eq(profiles.id, id), isNull(profiles.deletedAt)))
      .limit(1);
    return rows[0] ?? null;
  }

  async function createOrUpdateProfile(
    input: RegisterProfileInput
  ): Promise<ProfileRecord> {
    const id = deriveProfileId(input.sourceUrl);
    const revision = input.revision ?? null;
    const existing = await findBySource(input.sourceUrl);

    // Everything registration is allowed to change, in one place. Comparing the
    // whole set is what makes the no-op case honest: an earlier version only
    // refreshed `ompVersion` when the content hash matched, which meant derived
    // columns could never be corrected. The content hash identifies the *source*
    // bytes, not the code that derived facts from them, so improving extraction
    // left every existing row permanently stale.
    const desired = {
      contentHash: input.contentHash,
      facts: input.facts,
      gistId: input.gistId ?? null,
      metadata: input.metadata,
      ompVersion: input.ompVersion ?? null,
      owner: input.owner ?? null,
      profileName: input.profileName,
      revision,
      sourceType: input.sourceType,
      validation: toValidationMetadata(input.validation),
    } as const;

    if (existing) {
      const changed = (Object.keys(desired) as (keyof typeof desired)[]).filter(
        (key) => !sameStoredValue(existing[key], desired[key])
      );
      if (changed.length === 0) {
        return existing;
      }
      const updated = await db
        .update(profiles)
        .set({ ...desired, updatedAt: new Date() })
        .where(eq(profiles.id, existing.id))
        .returning();
      const row = updated[0];
      if (!row) {
        throw new Error(`profile disappeared during update: ${existing.id}`);
      }
      return row;
    }

    // Same field set as the update path, so the two cannot describe different
    // rows for the same input.
    const inserted = await db
      .insert(profiles)
      .values({ ...desired, id, sourceUrl: input.sourceUrl })
      .returning();
    const row = inserted[0];
    if (!row) {
      throw new Error(`profile insert returned no row: ${id}`);
    }
    return row;
  }

  /** Most recently updated records, newest first, capped at `limit`. */
  async function listRecent(
    limit = DEFAULT_SEARCH_LIMIT
  ): Promise<ProfileRecord[]> {
    return db
      .select()
      .from(profiles)
      .where(isNull(profiles.deletedAt))
      .orderBy(desc(profiles.updatedAt))
      .limit(clampLimit(limit));
  }

  async function searchProfiles(
    query: string,
    limit = DEFAULT_SEARCH_LIMIT
  ): Promise<ProfileRecord[]> {
    const trimmed = query.trim();
    const id = clampLimit(limit);
    if (trimmed === "") {
      // A blank query lists the most recently updated profiles — "empty lists
      // all", newest first — so first-run discovery works before any term is
      // typed. This is what turns the CLI's documented behaviour into truth.
      return listRecent(id);
    }
    const term = likeTerm(trimmed);
    // Parameterized ILIKE across displayable columns plus the normalized facts
    // JSON (which carries model/provider/advisor/hook names). Casting JSONB to
    // text lets a single term match any nested fact without per-field columns.
    return db
      .select()
      .from(profiles)
      .where(
        and(
          isNull(profiles.deletedAt),
          or(
            ilike(profiles.profileName, term),
            ilike(profiles.owner, term),
            ilike(profiles.sourceUrl, term),
            sql`${profiles.facts}::text ILIKE ${term}`
          )
        )
      )
      .orderBy(profiles.profileName)
      .limit(id);
  }

  async function softDeleteProfile(id: string): Promise<ProfileRecord | null> {
    // A raw update by id, not the deleted-filtered lookups, so marking an
    // already-deleted row again is still a no-op success that returns the row.
    const rows = await db
      .update(profiles)
      .set({ deletedAt: new Date() })
      .where(eq(profiles.id, id))
      .returning();
    return rows[0] ?? null;
  }

  return {
    createOrUpdateProfile,
    findBySource,
    getProfile,
    listRecent,
    searchProfiles,
    softDeleteProfile,
  };
}

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
import type { SQL } from "drizzle-orm";
import { and, asc, desc, eq, ilike, isNull, or, sql } from "drizzle-orm";
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

/**
 * The total order shared by {@link ProfileRepository.listRecent} and
 * {@link ProfileRepository.searchProfiles}: newest first, ties broken by id, so
 * every row has a unique position. A stable total order is what makes keyset
 * pagination safe — without the id tie-break, rows sharing an `updatedAt` could
 * be skipped or duplicated across pages.
 */
const RECENT_ORDER = [desc(profiles.updatedAt), desc(profiles.id)];

/**
 * A decoded keyset cursor: the (updatedAt, id) position of the last row on a
 * page, against which the next page is selected.
 */
export interface Cursor {
  /** Id of the last row on the page (total-order tie-break). */
  readonly i: string;
  /** ISO timestamp of the last row's `updatedAt`. */
  readonly u: string;
}

/** One page of results plus the opaque cursor for the page after it. */
export interface Page<T> {
  /** This page's rows, at most the requested limit. */
  readonly items: T[];
  /** Opaque cursor for the next page, or `null` when this is the last page. */
  readonly nextCursor: string | null;
}

/**
 * One source-check outcome as recorded by the freshness sweep. Exactly one of
 * `contentHash` (a successful fetch) or `error` (a failure) is expected;
 * carrying neither is a programming bug that {@link ProfileRepository.recordSourceCheck}
 * rejects.
 */
export interface SourceCheckResult {
  /** When the check ran; defaults to now. */
  readonly checkedAt?: Date;
  /** Observed content hash; present only when the fetch succeeded. */
  readonly contentHash?: string;
  /**
   * Stable value-free failure code; present only when the fetch failed. Typed
   * as the closed set so a raw error message — which can embed a URL — cannot
   * reach the column.
   */
  readonly error?: "not_found" | "unreachable";
  readonly id: string;
}

/**
 * Encode a row's (updatedAt, id) as an opaque URL-query-safe cursor. The payload
 * is ASCII (an id and an ISO timestamp), so `btoa`/`atob` — available in Node,
 * Bun, and Cloudflare Workers alike — are safe and dependency-free.
 */
export function encodeCursor(row: {
  id: string;
  updatedAt: Date | string;
}): string {
  const u =
    row.updatedAt instanceof Date ? row.updatedAt.toISOString() : row.updatedAt;
  return btoa(JSON.stringify({ i: row.id, u }));
}

/**
 * Decode a cursor to `{i, u}`, or return `null` for an absent, malformed, or
 * invalid value. Repositories treat `null` as "start from the top", so a bad
 * cursor degrades to a normal first page instead of throwing; the HTTP boundary
 * is responsible for turning a *present* bad cursor into a 400.
 */
export function decodeCursor(cursor: string | null | undefined): Cursor | null {
  if (typeof cursor !== "string" || cursor === "") {
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(atob(cursor));
  } catch {
    return null;
  }
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    typeof (parsed as Cursor).i !== "string" ||
    (parsed as Cursor).i === "" ||
    typeof (parsed as Cursor).u !== "string" ||
    Number.isNaN(Date.parse((parsed as Cursor).u))
  ) {
    return null;
  }
  return { i: (parsed as Cursor).i, u: (parsed as Cursor).u };
}

/**
 * Keyset boundary selecting strictly "before" the row at `(updatedAt, id)` in
 * the {@link RECENT_ORDER} total order (row-wise `<` on the pair matches the
 * DESC ordering). `undefined` when no cursor is set, which Drizzle's `and()`
 * ignores.
 */
function keysetPredicate(cursor: Cursor | null): SQL | undefined {
  return cursor === null
    ? undefined
    : sql`(${profiles.updatedAt}, ${profiles.id}) < (${cursor.u}::timestamptz, ${cursor.i})`;
}

/**
 * Fetch a page of rows: at most `limit`, plus one extra probe row so
 * {@link Page.nextCursor} can honestly say whether another page exists.
 */
async function pageRows(
  rows: ProfileRecord[],
  take: number
): Promise<{ items: ProfileRecord[]; nextCursor: string | null }> {
  const hasMore = rows.length > take;
  const items = hasMore ? rows.slice(0, take) : rows;
  const last = items.at(-1);
  return { items, nextCursor: hasMore && last ? encodeCursor(last) : null };
}

/** Persistence surface for indexed profile metadata. */
export interface ProfileRepository {
  /** Register a source or refresh its metadata; idempotent per source URL. */
  createOrUpdateProfile(input: RegisterProfileInput): Promise<ProfileRecord>;
  /** Find the record registered for a canonical source URL, if any. */
  findBySource(sourceUrl: string): Promise<ProfileRecord | null>;
  /** Look up a record by its stable opaque id. */
  getProfile(id: string): Promise<ProfileRecord | null>;
  /**
   * Not-yet-withdrawn rows, stalest first, for the freshness sweep: never
   * checked first (NULLS FIRST), then oldest `lastCheckedAt`, then `id` as a
   * total-order tie-break. Stale-before-fresh is what lets a young sweep catch
   * up on sources that were indexed long ago.
   */
  listProfilesToCheck(limit?: number): Promise<ProfileRecord[]>;
  /**
   * Most recently updated records, newest first, as a cursor-paginated page.
   * Pass the previous page's {@link Page.nextCursor} as `cursor` for the next
   * page; a `null`/absent/malformed cursor starts from the top.
   */
  listRecent(
    limit?: number,
    cursor?: string | null
  ): Promise<Page<ProfileRecord>>;
  /**
   * Record one source-check outcome, returning the updated row or `null` when
   * no row has that id. Must NOT touch `updatedAt`, which means "indexed
   * metadata changed" and drives the recency listing plus every keyset cursor.
   */
  recordSourceCheck(result: SourceCheckResult): Promise<ProfileRecord | null>;
  /**
   * Free-text search across name, owner, and normalized facts, cursor-paginated
   * over the same total order as {@link listRecent}.
   */
  searchProfiles(
    query: string,
    limit?: number,
    cursor?: string | null
  ): Promise<Page<ProfileRecord>>;
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
    // Look up by id (deterministic from the source URL) WITHOUT the deleted
    // filter, so re-registering a previously withdrawn source revives its row
    // instead of colliding with the surviving tombstone on a fresh insert.
    const existingRows = await db
      .select()
      .from(profiles)
      .where(eq(profiles.id, id))
      .limit(1);
    const existing = existingRows[0] ?? null;

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
      if (changed.length === 0 && existing.deletedAt === null) {
        return existing;
      }
      const updated = await db
        .update(profiles)
        .set({ ...desired, deletedAt: null, updatedAt: new Date() })
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

  /**
   * Most recently updated records, newest first, as a cursor-paginated page
   * (see {@link ProfileRepository.listRecent}).
   */
  async function listRecent(
    limit = DEFAULT_SEARCH_LIMIT,
    cursor: string | null = null
  ): Promise<Page<ProfileRecord>> {
    const take = clampLimit(limit);
    const rows = await db
      .select()
      .from(profiles)
      .where(
        and(isNull(profiles.deletedAt), keysetPredicate(decodeCursor(cursor)))
      )
      .orderBy(...RECENT_ORDER)
      .limit(take + 1);
    return pageRows(rows, take);
  }

  /**
   * Free-text search across name, owner, and normalized facts, cursor-paginated
   * over the same total order as {@link listRecent}. A blank query lists the
   * most recently updated profiles, newest first.
   */
  async function searchProfiles(
    query: string,
    limit = DEFAULT_SEARCH_LIMIT,
    cursor: string | null = null
  ): Promise<Page<ProfileRecord>> {
    const trimmed = query.trim();
    const take = clampLimit(limit);
    if (trimmed === "") {
      // A blank query lists the most recently updated profiles — "empty lists
      // all", newest first — so first-run discovery works before any term is
      // typed. This is what turns the CLI's documented behaviour into truth.
      return listRecent(take, cursor);
    }
    const term = likeTerm(trimmed);
    // Parameterized ILIKE across displayable columns plus the normalized facts
    // JSON (which carries model/provider/advisor/hook names). Casting JSONB to
    // text lets a single term match any nested fact without per-field columns.
    const rows = await db
      .select()
      .from(profiles)
      .where(
        and(
          isNull(profiles.deletedAt),
          keysetPredicate(decodeCursor(cursor)),
          or(
            ilike(profiles.profileName, term),
            ilike(profiles.owner, term),
            ilike(profiles.sourceUrl, term),
            sql`${profiles.facts}::text ILIKE ${term}`
          )
        )
      )
      .orderBy(...RECENT_ORDER)
      .limit(take + 1);
    return pageRows(rows, take);
  }

  /**
   * Not-yet-withdrawn rows, stalest first (see
   * {@link ProfileRepository.listProfilesToCheck}). `NULLS FIRST` is deliberate:
   * a bare `asc()` puts NULLs last in Postgres, which would check never-checked
   * sources dead last — exactly backwards for a catch-up sweep.
   */
  async function listProfilesToCheck(limit?: number): Promise<ProfileRecord[]> {
    const take = clampLimit(limit);
    return db
      .select()
      .from(profiles)
      .where(isNull(profiles.deletedAt))
      .orderBy(sql`${profiles.lastCheckedAt} asc nulls first`, asc(profiles.id))
      .limit(take);
  }

  /**
   * Record one source-check outcome (see
   * {@link ProfileRepository.recordSourceCheck}). Read-then-update by id,
   * deliberately WITHOUT the deleted filter, because checkFailures needs the
   * previous count, the hash comparison needs the indexed hash, and the
   * first-noticed `sourceChangedAt` must survive a repeat check.
   */
  async function recordSourceCheck(
    result: SourceCheckResult
  ): Promise<ProfileRecord | null> {
    const checkedAt = result.checkedAt ?? new Date();
    if (result.error === undefined && result.contentHash === undefined) {
      // An ambiguous result is a programming bug, not a state: fail before any
      // write so a broken sweep cannot silently mislabel a row.
      throw new Error(
        `ambiguous source check for ${result.id}: neither contentHash nor error given`
      );
    }
    const rows = await db
      .select()
      .from(profiles)
      .where(eq(profiles.id, result.id))
      .limit(1);
    const existing = rows[0];
    if (!existing) {
      return null;
    }

    if (result.error !== undefined) {
      const updated = await db
        .update(profiles)
        .set({
          checkFailures: existing.checkFailures + 1,
          lastCheckError: result.error,
          lastCheckedAt: checkedAt,
        })
        .where(eq(profiles.id, existing.id))
        .returning();
      // `sourceChangedAt` is deliberately untouched here.
      return updated[0] ?? null;
    }

    const changed = existing.contentHash !== result.contentHash;
    const updated = await db
      .update(profiles)
      .set({
        checkFailures: 0,
        lastCheckError: null,
        lastCheckedAt: checkedAt,
        // First-noticed wins: keep the prior sourceChangedAt when drift was
        // already seen, else stamp this check as the first observation.
        sourceChangedAt: changed
          ? (existing.sourceChangedAt ?? checkedAt)
          : null,
      })
      .where(eq(profiles.id, existing.id))
      .returning();
    return updated[0] ?? null;
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
    listProfilesToCheck,
    listRecent,
    recordSourceCheck,
    searchProfiles,
    softDeleteProfile,
  };
}

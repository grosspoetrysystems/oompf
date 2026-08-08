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

import { sha256 } from "@oompf/core";
import type { ProfileFacts } from "@oompf/core";
import { eq, ilike, or, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";

import {
  profiles,
  type ProfileRow,
  type ProfileValidationMetadata,
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
  readonly structural: "valid" | "invalid";
  readonly errors: readonly string[];
  readonly warnings: readonly string[];
  readonly blocking: readonly StoredSecretFinding[];
  readonly findings: readonly StoredSecretFinding[];
  readonly byteLength: number;
  readonly hash: string;
}

/** Metadata supplied when registering (or re-registering) a source. */
export interface RegisterProfileInput {
  /** Origin kind, e.g. `"gist"`. */
  readonly sourceType: string;
  /** Canonical, normalized source URL. */
  readonly sourceUrl: string;
  /** Opaque Gist identifier when applicable. */
  readonly gistId?: string | null;
  /** Source owner login, or `null`/omitted when anonymous. */
  readonly owner?: string | null;
  /** Human-facing profile name. */
  readonly profileName: string;
  /** OMP version the profile targets, when declared. */
  readonly ompVersion?: string | null;
  /** Pinned source revision (git SHA), when known. */
  readonly revision?: string | null;
  /** Lowercase hex SHA-256 of the canonical source bytes. */
  readonly contentHash: string;
  /** Normalized, source-derived facts. */
  readonly facts: ProfileFacts;
  /** Structural validation results (content fields are stripped). */
  readonly validation: ValidationInput;
}

/** Persistence surface for indexed profile metadata. */
export interface ProfileRepository {
  /** Find the record registered for a canonical source URL, if any. */
  findBySource(sourceUrl: string): Promise<ProfileRecord | null>;
  /** Register a source or refresh its metadata; idempotent per source URL. */
  createOrUpdateProfile(input: RegisterProfileInput): Promise<ProfileRecord>;
  /** Look up a record by its stable opaque id. */
  getProfile(id: string): Promise<ProfileRecord | null>;
  /** Free-text search across name, owner, and normalized facts. */
  searchProfiles(query: string): Promise<ProfileRecord[]>;
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
export function toValidationMetadata(input: ValidationInput): ProfileValidationMetadata {
  return {
    structural: input.structural,
    errors: [...input.errors],
    warnings: [...input.warnings],
    blocking: input.blocking.map((f) => ({
      path: f.path,
      kind: f.kind,
      confidence: f.confidence,
      reason: f.reason,
    })),
    findings: input.findings.map((f) => ({
      path: f.path,
      kind: f.kind,
      confidence: f.confidence,
      reason: f.reason,
    })),
    byteLength: input.byteLength,
    hash: input.hash,
  };
}

/** Escape LIKE wildcards so a query term matches literally. */
function likeTerm(query: string): string {
  const escaped = query.replace(/[\\%_]/g, (char) => `\\${char}`);
  return `%${escaped}%`;
}

/**
 * Build a {@link ProfileRepository} backed by the injected Drizzle database.
 */
export function createProfileRepository(db: ProfileDatabase): ProfileRepository {
  async function findBySource(sourceUrl: string): Promise<ProfileRecord | null> {
    const rows = await db
      .select()
      .from(profiles)
      .where(eq(profiles.sourceUrl, sourceUrl))
      .limit(1);
    return rows[0] ?? null;
  }

  async function getProfile(id: string): Promise<ProfileRecord | null> {
    const rows = await db.select().from(profiles).where(eq(profiles.id, id)).limit(1);
    return rows[0] ?? null;
  }

  async function createOrUpdateProfile(
    input: RegisterProfileInput,
  ): Promise<ProfileRecord> {
    const id = deriveProfileId(input.sourceUrl);
    const revision = input.revision ?? null;
    const validation = toValidationMetadata(input.validation);
    const existing = await findBySource(input.sourceUrl);

    if (existing) {
      // Idempotent: identical revision and content hash means nothing changed,
      // so return the current record untouched (createdAt/updatedAt preserved).
      if (existing.revision === revision && existing.contentHash === input.contentHash) {
        return existing;
      }
      const updated = await db
        .update(profiles)
        .set({
          sourceType: input.sourceType,
          gistId: input.gistId ?? null,
          owner: input.owner ?? null,
          profileName: input.profileName,
          ompVersion: input.ompVersion ?? null,
          revision,
          contentHash: input.contentHash,
          facts: input.facts,
          validation,
          updatedAt: new Date(),
        })
        .where(eq(profiles.id, existing.id))
        .returning();
      const row = updated[0];
      if (!row) throw new Error(`profile disappeared during update: ${existing.id}`);
      return row;
    }

    const inserted = await db
      .insert(profiles)
      .values({
        id,
        sourceType: input.sourceType,
        sourceUrl: input.sourceUrl,
        gistId: input.gistId ?? null,
        owner: input.owner ?? null,
        profileName: input.profileName,
        ompVersion: input.ompVersion ?? null,
        revision,
        contentHash: input.contentHash,
        facts: input.facts,
        validation,
      })
      .returning();
    const row = inserted[0];
    if (!row) throw new Error(`profile insert returned no row: ${id}`);
    return row;
  }

  async function searchProfiles(query: string): Promise<ProfileRecord[]> {
    const trimmed = query.trim();
    if (trimmed === "") return [];
    const term = likeTerm(trimmed);
    // Parameterized ILIKE across displayable columns plus the normalized facts
    // JSON (which carries model/provider/advisor/hook names). Casting JSONB to
    // text lets a single term match any nested fact without per-field columns.
    return db
      .select()
      .from(profiles)
      .where(
        or(
          ilike(profiles.profileName, term),
          ilike(profiles.owner, term),
          ilike(profiles.sourceUrl, term),
          sql`${profiles.facts}::text ILIKE ${term}`,
        ),
      )
      .orderBy(profiles.profileName);
  }

  return { findBySource, createOrUpdateProfile, getProfile, searchProfiles };
}

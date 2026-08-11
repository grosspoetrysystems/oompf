/**
 * Drizzle schema for OOMPF's metadata-only profile index.
 *
 * The index stores *facts about* a canonical OMP profile artifact — never the
 * artifact bytes themselves. There is deliberately no `content`/`yaml`/blob
 * column: the canonical source lives at its origin (a public Gist), and OOMPF
 * only persists derived, displayable metadata plus enough coordinates to fetch
 * or re-verify the source. `facts` and `validation` are JSONB so search and
 * forward-compatible fields need no migration churn.
 *
 * Worker-safe: `drizzle-orm/pg-core` is a pure schema builder with no Node-only
 * driver dependency, so this module runs unchanged in a Cloudflare Worker.
 */

import type { ProfileFacts, ProfileMetadata } from "@oompf/core";
import {
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

/**
 * A single secret finding as persisted in the index. This mirrors the core
 * `SecretFinding` shape but is redeclared here so the stored JSON contract is
 * explicit and never drifts into carrying a secret value.
 */
export interface StoredSecretFinding {
  readonly confidence: "high" | "low";
  readonly kind: string;
  readonly path: string;
  readonly reason: string;
}

/**
 * Validation results as persisted in the index: the structural verdict plus
 * value-free advisories and findings. This intentionally omits the parsed
 * document and the original YAML bytes — those are canonical artifact content
 * and must never be stored here.
 */
export interface ProfileValidationMetadata {
  readonly blocking: readonly StoredSecretFinding[];
  /** UTF-8 byte length of the artifact the metadata was derived from. */
  readonly byteLength: number;
  readonly errors: readonly string[];
  readonly findings: readonly StoredSecretFinding[];
  /** SHA-256 of the canonical bytes, retained for cross-checking sources. */
  readonly hash: string;
  readonly structural: "valid" | "invalid";
  readonly warnings: readonly string[];
}

/**
 * Indexed profile metadata. One row per canonical source URL.
 *
 * `id` is a stable, opaque identifier derived from the canonical source URL, so
 * re-registering the same source always resolves to the same row. `facts` and
 * `validation` are metadata-only JSONB; no artifact content column exists.
 */
export const profiles = pgTable(
  "profiles",
  {
    /** Lowercase hex SHA-256 of the canonical source bytes. */
    contentHash: text("content_hash").notNull(),
    /** First-indexed timestamp; preserved across re-registration. */
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true })
      .notNull()
      .defaultNow(),
    /** Normalized, source-derived facts. */
    facts: jsonb("facts").$type<ProfileFacts>().notNull(),
    /** Opaque Gist identifier when the source is a Gist, else `null`. */
    gistId: text("gist_id"),
    /** Stable opaque profile identifier (see {@link deriveProfileId}). */
    id: text("id").primaryKey(),
    /** Publisher-curated `oompf` metadata (summary, kind, tags, links). */
    metadata: jsonb("metadata")
      .$type<ProfileMetadata>()
      .notNull()
      .default({ kind: null, links: [], summary: null, tags: [] }),
    /** OMP version the profile targets, when declared. */
    ompVersion: text("omp_version"),
    /** Source owner login, or `null` for anonymous sources. */
    owner: text("owner"),
    /** Human-facing profile name (validated `<name>`). */
    profileName: text("profile_name").notNull(),
    /** Pinned source revision (git SHA) the metadata was read from. */
    revision: text("revision"),
    /** Origin kind, e.g. `"gist"`. */
    sourceType: text("source_type").notNull(),
    /** Canonical, normalized source URL; unique across the index. */
    sourceUrl: text("source_url").notNull(),
    /** Last-updated timestamp; bumped only when metadata changes. */
    updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true })
      .notNull()
      .defaultNow(),
    /** Structural validation metadata (never artifact content). */
    validation: jsonb("validation")
      .$type<ProfileValidationMetadata>()
      .notNull(),
  },
  (table) => [uniqueIndex("profiles_source_url_key").on(table.sourceUrl)]
);

/** A row as selected from {@link profiles}. */
export type ProfileRow = typeof profiles.$inferSelect;

/** A row as inserted into {@link profiles}. */
export type ProfileInsert = typeof profiles.$inferInsert;

/** Every table exported for Drizzle's schema-aware query APIs. */
export const schema = { profiles };

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
  integer,
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
    /**
     * Consecutive failed source checks; `0` means the last check succeeded or
     * none has run yet. Reset to `0` on any successful fetch. A check that could
     * not be performed — GitHub rate limiting, a 5xx — is not a failure and
     * leaves this untouched, so a shared-IP quota cannot brand a live source
     * dead.
     */
    checkFailures: integer("check_failures").notNull().default(0),
    /** Lowercase hex SHA-256 of the canonical source bytes. */
    contentHash: text("content_hash").notNull(),
    /** First-indexed timestamp; preserved across re-registration. */
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true })
      .notNull()
      .defaultNow(),
    /** Deleted through the removal route; `null` until then. */
    deletedAt: timestamp("deleted_at", { mode: "date", withTimezone: true }),
    /** Normalized, source-derived facts. */
    facts: jsonb("facts").$type<ProfileFacts>().notNull(),
    /** Opaque Gist identifier when the source is a Gist, else `null`. */
    gistId: text("gist_id"),
    /** Stable opaque profile identifier (see {@link deriveProfileId}). */
    id: text("id").primaryKey(),
    /**
     * Stable value-free code from the most recent *conclusive* failed check:
     * `"not_found"` (GitHub answered 404, so deleted or made private) or
     * `"unreachable"` (reached, but no longer yields one usable profile YAML).
     * `null` when the last check succeeded.
     */
    lastCheckError: text("last_check_error"),
    /**
     * When the most recent *conclusive* source check ran; `null` means the
     * source has never been checked. A skipped check does not advance it, so the
     * row keeps its place at the front of the sweep queue.
     */
    lastCheckedAt: timestamp("last_checked_at", {
      mode: "date",
      withTimezone: true,
    }),
    /** Publisher-curated `oompf` metadata (summary, kind, tags, links). */
    metadata: jsonb("metadata")
      .$type<ProfileMetadata>()
      .notNull()
      .default({ kind: null, links: [], summary: null, tags: [] }),
    /**
     * Consecutive conclusive 404 checks — the `"not_found"` run that proves a
     * source is gone, distinct from {@link checkFailures} (which conflates
     * both failure codes for the freshness badge). Incremented only by a
     * `not_found` verdict: any successful fetch or any `unreachable` answer
     * resets it, because a source that answered at all was reachable, and a
     * source that fetched cleanly is back. The sweep withdraws a row once this
     * crosses its threshold, diverging a vanished source toward the same
     * withdrawn state an explicit unpublish produces.
     */
    notFoundStreak: integer("not_found_streak").notNull().default(0),
    /** OMP version the profile targets, when declared. */
    ompVersion: text("omp_version"),
    /** Source owner login, or `null` for anonymous sources. */
    owner: text("owner"),
    /** Human-facing profile name (validated `<name>`). */
    profileName: text("profile_name").notNull(),
    /** Pinned source revision (git SHA) the metadata was read from. */
    revision: text("revision"),
    /**
     * When content was first observed to differ from the indexed snapshot;
     * `null` means the source has not drifted since it was indexed. First
     * notice wins, so a repeated check does not keep advancing it.
     */
    sourceChangedAt: timestamp("source_changed_at", {
      mode: "date",
      withTimezone: true,
    }),
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

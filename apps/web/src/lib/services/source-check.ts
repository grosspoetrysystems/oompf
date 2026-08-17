/**
 * OOMPF source-freshness sweep service.
 *
 * A Cloudflare Cron Trigger calls this every six hours to re-check each
 * indexed profile's source against its current head. The sweep RECORDS
 * signals only: it never re-indexes facts, never rewrites the indexed
 * `facts`/`validation`/`metadata`, and never soft-deletes. Those columns'
 * values change only through the normal `POST /api/v1/profiles` re-index
 * path, so the sweep is safe to run and safe to skip — it can neither corrupt
 * the landing page's metadata nor mutate the artifact intent. (Converging a
 * dead source to a withdrawn state is deliberately out of scope; that is a
 * separate ticket.)
 *
 * Each check fetches the source WITHOUT a pinned revision (the unpinned
 * canonical URL) so it observes the source's *current* head, not the revision
 * the metadata was last read from. A pinned fetch can never observe drift — it
 * would return the same bytes the index already has — which would make every
 * profile look perpetually unchanged.
 *
 * Like the indexing service, this module imports from `@oompf/github/gists`
 * (not the package barrel, which drags in CLI-only `child_process` code) and
 * runs unchanged inside a Cloudflare Worker.
 */

import type { ProfileRepository } from "@oompf/database";
import { fetchPublicGist, normalizeGistUrl } from "@oompf/github/gists";

import type { FetchPublicGist } from "./index-profile.ts";

/**
 * How many staleest rows one sweep invocation checks. Each row costs about
 * four subrequests (two GitHub fetches plus the select+update inside
 * `recordSourceCheck`), so ten rows is ~41 — under the free plan's 50-subrequest
 * Worker budget. A larger index is covered by successive cron invocations: the
 * staleest-first ordering means each invocation picks up where the last left off.
 * ponytail: fixed per-invocation ceiling calibrated to the free-plan 50-subrequest
 * limit; raise it once that limit is confirmed higher, or paginate across
 * invocations if the index outgrows a single sweep.
 */
export const DEFAULT_SWEEP_LIMIT = 10;

/** Injectable seams for {@link sweepSourceChecks}. */
export interface SourceSweepDeps {
  /** Gist-fetch seam; defaults to the real `fetchPublicGist`. */
  readonly fetchGist?: FetchPublicGist;
  /** How many staleest rows to check in one sweep. */
  readonly limit?: number;
  /** Clock seam. */
  readonly now?: () => Date;
  /** Persistence surface for check outcomes. */
  readonly repository: ProfileRepository;
}

/** Outcome counts for one sweep invocation. */
export interface SourceSweepSummary {
  /** Rows whose observed content differs from the indexed hash. */
  readonly changed: number;
  readonly checked: number;
  readonly failed: number;
}

/**
 * Map a fetch failure to the closed-set, value-free stored code. The raw
 * error message may embed a URL or other value, so it must never become the
 * stored code — the codes are exactly `"not_found"` and `"unreachable"`.
 */
function classifyCheckError(error: unknown): "not_found" | "unreachable" {
  const message = error instanceof Error ? error.message : String(error);
  return /was not found/i.test(message) ? "not_found" : "unreachable";
}

/**
 * Check the staleest indexed sources against their current head and record
 * the outcome per row. Sequential, never `Promise.all`: each check costs two
 * outbound GitHub fetches and a Worker has a bounded subrequest budget. A
 * single row's failure must never abort the sweep, so each is classified and
 * recorded before moving on.
 */
export async function sweepSourceChecks(
  deps: SourceSweepDeps
): Promise<SourceSweepSummary> {
  const repository = deps.repository;
  const fetchGist = deps.fetchGist ?? fetchPublicGist;
  const checkedAt = deps.now?.() ?? new Date();
  const rows = await repository.listProfilesToCheck(
    deps.limit ?? DEFAULT_SWEEP_LIMIT
  );

  let changed = 0;
  let failed = 0;

  for (const row of rows) {
    try {
      // Ask for the source's current head: `normalizeGistUrl` drops the
      // revision, so a pinned reference cannot pin us to the revision the
      // metadata was read from — a pinned fetch would always match the indexed
      // hash and observe no drift. It is inside the guard because it throws on a
      // reference it cannot parse, and one unparseable stored URL must cost that
      // row a check, not abort every row after it.
      const gist = await fetchGist(normalizeGistUrl(row.sourceUrl));
      if (gist.contentHash !== row.contentHash) {
        changed++;
      }
      await repository.recordSourceCheck({
        checkedAt,
        contentHash: gist.contentHash,
        id: row.id,
      });
    } catch (error) {
      failed++;
      await repository.recordSourceCheck({
        checkedAt,
        error: classifyCheckError(error),
        id: row.id,
      });
    }
  }

  return { changed, checked: rows.length, failed };
}

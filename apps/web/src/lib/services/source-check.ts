/**
 * OOMPF source-freshness sweep service.
 *
 * A Cloudflare Cron Trigger calls this every six hours to re-check each
 * indexed profile's source against its current head. The sweep RECORDS
 * signals only: it never re-indexes facts, never rewrites the indexed
 * `facts`/`validation`/`metadata`. Those columns' values change only through
 * the normal `POST /api/v1/profiles` re-index path, so the sweep is safe to
 * run and safe to skip. The one mutation it does perform is converging a
 * source confirmed gone (enough consecutive 404s) to the same withdrawn state
 * an explicit unpublish produces, via the shared soft-delete — that is the
 * point of GPS-149, not an incidental cleanup.
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
import {
  fetchPublicGist,
  GistHttpError,
  type GistSource,
  normalizeGistUrl,
} from "@oompf/github/gists";

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

/**
 * How many consecutive conclusive 404 checks (about seven days at one sweep
 * every six hours) converge a source to the withdrawn state an explicit
 * unpublish produces, via the shared soft-delete. Kept deliberately long and
 * reversible: a single 404 can mean "deleted", "made private", or "GitHub had
 * a moment", and only a durable run distinguishes those. A returning source
 * revives — re-registration clears the tombstone and the next clean fetch
 * resets the streak.
 */
export const WITHDRAW_NOT_FOUND_THRESHOLD = 28;

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
  /**
   * Consecutive 404s that withdraw a source; defaults to
   * {@link WITHDRAW_NOT_FOUND_THRESHOLD}. Inject a small value in tests so the
   * withdrawal path can be exercised without 28 sweeps.
   */
  readonly withdrawAfterNotFound?: number;
}

/** Outcome counts for one sweep invocation. */
export interface SourceSweepSummary {
  /** Rows whose observed content differs from the indexed hash. */
  readonly changed: number;
  /** Rows attempted, including the ones that produced no verdict. */
  readonly checked: number;
  /** Rows recorded as a failed check. */
  readonly failed: number;
  /** Rows left untouched because the check could not be performed at all. */
  readonly skipped: number;
  /** Rows converged to the withdrawn state after enough consecutive 404s. */
  readonly withdrawn: number;
}

/**
 * HTTP statuses that say nothing about the source, only about our ability to
 * ask right now. GitHub's unauthenticated API allows 60 requests per hour per
 * IP and a Worker egresses from shared addresses, so 403 and 429 are routine
 * and carry no evidence; 408 and 5xx are GitHub having a moment.
 */
const UNDECIDED_STATUSES = new Set([401, 403, 408, 429]);

/**
 * Map a fetch failure either to the closed-set, value-free stored code or to
 * `null`, meaning the check did not happen and must not be recorded.
 *
 * Recording a rate-limited request as a failure is how a live profile gets
 * branded dead: two sweeps into a shared-IP quota and the page would claim the
 * source is unreachable. Only a definite 404, a non-transient HTTP error, or a
 * source that no longer yields one usable profile YAML is evidence.
 */
function classifyCheckError(
  error: unknown
): "not_found" | "unreachable" | null {
  if (error instanceof GistHttpError) {
    if (error.status === 404) {
      return "not_found";
    }
    return error.status >= 500 || UNDECIDED_STATUSES.has(error.status)
      ? null
      : "unreachable";
  }
  return "unreachable";
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
  let skipped = 0;
  let withdrawn = 0;
  // Realized streak threshold for this sweep invocation.
  const withdrawAfter =
    deps.withdrawAfterNotFound ?? WITHDRAW_NOT_FOUND_THRESHOLD;

  for (const row of rows) {
    let gist: GistSource | null = null;
    try {
      // Ask for the source's current head: `normalizeGistUrl` drops the
      // revision, so a pinned reference cannot pin us to the revision the
      // metadata was read from — a pinned fetch would always match the indexed
      // hash and observe no drift. It is inside the guard because it throws on a
      // reference it cannot parse, and one unparseable stored URL must cost that
      // row a check, not abort every row after it.
      gist = await fetchGist(normalizeGistUrl(row.sourceUrl));
    } catch (error) {
      const code = classifyCheckError(error);
      if (code === null) {
        // Not a verdict: leave `lastCheckedAt` and the failure count alone so
        // the row stays exactly as stale as it was, and gets picked up first by
        // the next sweep.
        skipped++;
        continue;
      }
      failed++;
      const updated = await repository.recordSourceCheck({
        checkedAt,
        error: code,
        id: row.id,
      });
      // A source that has looked gone for the whole grace window converges to
      // the same withdrawn state an explicit unpublish produces, via the shared
      // soft-delete. `recordSourceCheck` reads the row fresh, so `updated` is
      // the authoritative post-increment streak; a `null` (concurrent delete or
      // a stub in tests) just means there is nothing left to withdraw.
      if (
        code === "not_found" &&
        updated !== null &&
        updated.notFoundStreak >= withdrawAfter
      ) {
        await repository.softDeleteProfile(row.id);
        withdrawn++;
      }
      continue;
    }
    // Only a resolved fetch reaches the record below, so a database failure
    // here cannot be misread as a verdict about the source.
    if (gist.contentHash !== row.contentHash) {
      changed++;
    }
    await repository.recordSourceCheck({
      checkedAt,
      contentHash: gist.contentHash,
      id: row.id,
    });
  }

  return { changed, checked: rows.length, failed, skipped, withdrawn };
}

import { describe, expect, test } from "bun:test";
import { sha256 } from "@oompf/core";
import type {
  ProfileRecord,
  ProfileRepository,
  SourceCheckResult,
} from "@oompf/database";
import { GistHttpError, type GistSource } from "@oompf/github/gists";
import type { FetchPublicGist } from "./index-profile.ts";
import {
  DEFAULT_SWEEP_LIMIT,
  sweepSourceChecks,
  WITHDRAW_NOT_FOUND_THRESHOLD,
} from "./source-check.ts";

// Canonical (owner-free) form, matching what `sweepSourceChecks` fetches.
const SOURCE = "https://gist.github.com/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

/** A distinctive YAML body; two different bodies hash differently. */
const YAML_A = "# canary\name: atlas\n";
const YAML_B = "# canary\name: nova\n";

/** Build a resolved Gist source, defaulting the hash to match its content. */
function makeGist(content: string): GistSource {
  return {
    content,
    contentHash: sha256(content),
    filename: "atlas.yml",
    gistId: "a".repeat(32),
    htmlUrl: "https://gist.github.com/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    owner: "octocat",
    revision: null,
  };
}

/** A fetch seam that resolves every source to a fixed gist by source URL. */
function stubFetchGist(gists: Record<string, GistSource>): FetchPublicGist {
  return async (source: string) => {
    const gist = gists[source];
    if (gist === undefined) {
      throw new Error(`Gist was not found: ${source}`);
    }
    return gist;
  };
}

/** A fetch seam that always rejects with a plain, non-HTTP error. */
function rejectingFetchGist(message: string): FetchPublicGist {
  return async () => {
    throw new Error(message);
  };
}

/** A fetch seam that always rejects with an HTTP failure of the given status. */
function httpFailingFetchGist(status: number): FetchPublicGist {
  return async () => {
    throw new GistHttpError(`Failed to fetch Gist: HTTP ${status}.`, status);
  };
}

/** A simple row the sweep consumes: id, canonical source, indexed hash. */
interface SwRow {
  readonly contentHash: string;
  readonly id: string;
  readonly notFoundStreak?: number;
  readonly sourceUrl: string;
}

/**
 * An in-memory fake for the parts of {@link ProfileRepository} the sweep uses:
 * `listProfilesToCheck`, `recordSourceCheck`, and `softDeleteProfile`, so tests
 * stay hermetically off the network and the database. Rows carry a mutable
 * `notFoundStreak` so the sweep's withdrawal path (read the post-increment
 * streak, then soft-delete past the threshold) can be exercised end to end.
 */
function fakeRepository(rows: SwRow[]): {
  listLimit: () => number | null;
  recorded: SourceCheckResult[];
  recordedStreak: Record<string, number>;
  repository: ProfileRepository;
  softDeleted: string[];
} {
  const recorded: SourceCheckResult[] = [];
  const recordedStreak: Record<string, number> = {};
  const softDeleted: string[] = [];
  let listLimit: number | null = null;
  const byId = new Map(
    rows.map((r) => [
      r.id,
      {
        contentHash: r.contentHash,
        id: r.id,
        notFoundStreak: r.notFoundStreak ?? 0,
        sourceUrl: r.sourceUrl,
      },
    ])
  );
  const repository = {
    async listProfilesToCheck(limit?: number): Promise<ProfileRecord[]> {
      listLimit = limit ?? null;
      return [...byId.values()] as unknown as ProfileRecord[];
    },
    async recordSourceCheck(
      result: SourceCheckResult
    ): Promise<ProfileRecord | null> {
      recorded.push(result);
      const row = byId.get(result.id);
      if (row === undefined) {
        return null;
      }
      if (result.error !== undefined) {
        row.notFoundStreak =
          result.error === "not_found" ? row.notFoundStreak + 1 : 0;
      } else {
        row.notFoundStreak = 0;
      }
      recordedStreak[result.id] = row.notFoundStreak;
      return row as unknown as ProfileRecord;
    },
    async softDeleteProfile(id: string): Promise<ProfileRecord | null> {
      softDeleted.push(id);
      return byId.get(id) as unknown as ProfileRecord | null;
    },
  } as unknown as ProfileRepository;
  return {
    listLimit: () => listLimit,
    recorded,
    recordedStreak,
    repository,
    softDeleted,
  };
}

describe("sweepSourceChecks", () => {
  test("an unchanged source records a success and reports changed: 0", async () => {
    const hash = sha256(YAML_A);
    const fake = fakeRepository([
      { contentHash: hash, id: "p1", sourceUrl: SOURCE },
    ]);
    const summary = await sweepSourceChecks({
      fetchGist: stubFetchGist({ [SOURCE]: makeGist(YAML_A) }),
      repository: fake.repository,
    });

    expect(summary).toEqual({
      changed: 0,
      checked: 1,
      failed: 0,
      skipped: 0,
      withdrawn: 0,
    });
    expect(fake.recorded).toHaveLength(1);
    expect(fake.recorded[0]?.id).toBe("p1");
    expect(fake.recorded[0]?.contentHash).toBe(hash);
    expect(fake.recorded[0]?.error).toBeUndefined();
  });

  test("a changed source reports changed: 1 and passes the new hash through", async () => {
    const oldHash = sha256(YAML_A);
    const newGist = makeGist(YAML_B);
    const fake = fakeRepository([
      { contentHash: oldHash, id: "p1", sourceUrl: SOURCE },
    ]);
    const summary = await sweepSourceChecks({
      fetchGist: stubFetchGist({ [SOURCE]: newGist }),
      repository: fake.repository,
    });

    expect(summary).toEqual({
      changed: 1,
      checked: 1,
      failed: 0,
      skipped: 0,
      withdrawn: 0,
    });
    expect(fake.recorded[0]?.contentHash).toBe(newGist.contentHash);
  });

  test("a 404 records not_found, a reached-but-broken source unreachable", async () => {
    const hash = sha256(YAML_A);
    const missing = fakeRepository([
      { contentHash: hash, id: "p1", sourceUrl: SOURCE },
    ]);
    await sweepSourceChecks({
      fetchGist: httpFailingFetchGist(404),
      repository: missing.repository,
    });

    const unreachable = fakeRepository([
      { contentHash: hash, id: "p1", sourceUrl: SOURCE },
    ]);
    await sweepSourceChecks({
      fetchGist: rejectingFetchGist(
        'Gist "d4e5" contains multiple YAML files: https://example.invalid/secrets'
      ),
      repository: unreachable.repository,
    });

    expect(missing.recorded[0]?.error).toBe("not_found");
    expect(unreachable.recorded[0]?.error).toBe("unreachable");
    for (const rec of [...missing.recorded, ...unreachable.recorded]) {
      // The codes are a closed set; no raw error text may leak into them.
      expect(["not_found", "unreachable"]).toContain(rec.error);
      expect(rec.error).not.toMatch(/example|multiple|https?:/);
    }
  });

  test("a rate-limited or failing GitHub is not a verdict about the source", async () => {
    const hash = sha256(YAML_A);
    for (const status of [401, 403, 429, 500, 503]) {
      const fake = fakeRepository([
        { contentHash: hash, id: "p1", sourceUrl: SOURCE },
      ]);
      const summary = await sweepSourceChecks({
        fetchGist: httpFailingFetchGist(status),
        repository: fake.repository,
      });

      // Nothing recorded at all: the row keeps its previous lastCheckedAt and
      // failure count, so a shared-IP quota cannot brand a live profile dead.
      expect(fake.recorded).toEqual([]);
      expect(summary).toEqual({
        changed: 0,
        checked: 1,
        failed: 0,
        skipped: 1,
        withdrawn: 0,
      });
    }
  });

  test("a conclusive non-404 HTTP answer is a verdict about the source", async () => {
    // 410 Gone says the Gist entity is gone for good — that is evidence, so it
    // records `unreachable`, unlike a 403 quota answer which records nothing.
    const hash = sha256(YAML_A);
    for (const status of [410, 422, 451]) {
      const fake = fakeRepository([
        { contentHash: hash, id: "p1", sourceUrl: SOURCE },
      ]);
      const summary = await sweepSourceChecks({
        fetchGist: httpFailingFetchGist(status),
        repository: fake.repository,
      });

      expect(fake.recorded[0]?.error).toBe("unreachable");
      expect(summary).toEqual({
        changed: 0,
        checked: 1,
        failed: 1,
        skipped: 0,
        withdrawn: 0,
      });
    }
  });

  test("a skipped row does not stop the rows after it", async () => {
    const hash = sha256(YAML_A);
    const other = "https://gist.github.com/bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
    const fake = fakeRepository([
      { contentHash: hash, id: "p1", sourceUrl: SOURCE },
      { contentHash: hash, id: "p2", sourceUrl: other },
    ]);

    const summary = await sweepSourceChecks({
      fetchGist: async (source: string) => {
        if (source === SOURCE) {
          throw new GistHttpError("Failed to fetch Gist: HTTP 403.", 403);
        }
        return makeGist(YAML_A);
      },
      repository: fake.repository,
    });

    expect(fake.recorded.map((r) => r.id)).toEqual(["p2"]);
    expect(summary).toEqual({
      changed: 0,
      checked: 2,
      failed: 0,
      skipped: 1,
      withdrawn: 0,
    });
  });

  test("one failing row does not abort the sweep", async () => {
    const aHash = sha256(YAML_A);
    const fake = fakeRepository([
      {
        contentHash: aHash,
        id: "p1",
        sourceUrl: "https://gist.github.com/11111111111111111111111111111111",
      },
      {
        contentHash: aHash,
        id: "p2",
        sourceUrl: "https://gist.github.com/22222222222222222222222222222222",
      },
      {
        contentHash: aHash,
        id: "p3",
        sourceUrl: "https://gist.github.com/33333333333333333333333333333333",
      },
    ]);
    const gists: Record<string, GistSource> = {
      "https://gist.github.com/11111111111111111111111111111111":
        makeGist(YAML_B),
      "https://gist.github.com/33333333333333333333333333333333":
        makeGist(YAML_B),
    };

    async function flakyFetch(source: string): Promise<GistSource> {
      const gist = gists[source];
      if (gist === undefined) {
        throw new GistHttpError("Public Gist was not found.", 404);
      }
      return gist;
    }

    const summary = await sweepSourceChecks({
      fetchGist: flakyFetch,
      repository: fake.repository,
    });

    expect(fake.recorded).toHaveLength(3);
    expect(fake.recorded.map((r) => r.id)).toEqual(["p1", "p2", "p3"]);
    expect(fake.recorded[1]?.error).toBe("not_found");
    expect(summary).toEqual({
      changed: 2,
      checked: 3,
      failed: 1,
      skipped: 0,
      withdrawn: 0,
    });
  });

  test("a stored source URL that cannot be parsed costs one row, not the sweep", async () => {
    const hash = sha256(YAML_A);
    const fake = fakeRepository([
      { contentHash: hash, id: "p1", sourceUrl: "not-a-gist-reference" },
      { contentHash: hash, id: "p2", sourceUrl: SOURCE },
    ]);

    const summary = await sweepSourceChecks({
      fetchGist: stubFetchGist({ [SOURCE]: makeGist(YAML_A) }),
      repository: fake.repository,
    });

    // Normalizing the reference throws before any fetch, so the guard has to
    // cover it: otherwise one bad row silently stops every row after it.
    expect(fake.recorded.map((r) => r.id)).toEqual(["p1", "p2"]);
    expect(fake.recorded[0]?.error).toBe("unreachable");
    expect(fake.recorded[1]?.contentHash).toBe(hash);
    expect(summary).toEqual({
      changed: 0,
      checked: 2,
      failed: 1,
      skipped: 0,
      withdrawn: 0,
    });
  });

  test("passes its resolved limit and defaults to DEFAULT_SWEEP_LIMIT", async () => {
    const hash = sha256(YAML_A);
    const withLimit = fakeRepository([
      { contentHash: hash, id: "p1", sourceUrl: SOURCE },
    ]);
    await sweepSourceChecks({
      fetchGist: stubFetchGist({ [SOURCE]: makeGist(YAML_A) }),
      limit: 3,
      repository: withLimit.repository,
    });
    expect(withLimit.listLimit()).toBe(3);

    const defaulted = fakeRepository([
      { contentHash: hash, id: "p1", sourceUrl: SOURCE },
    ]);
    await sweepSourceChecks({
      fetchGist: stubFetchGist({ [SOURCE]: makeGist(YAML_A) }),
      repository: defaulted.repository,
    });
    expect(defaulted.listLimit()).toBe(DEFAULT_SWEEP_LIMIT);
  });

  test("checkedAt comes from the injected clock", async () => {
    const hash = sha256(YAML_A);
    const fake = fakeRepository([
      { contentHash: hash, id: "p1", sourceUrl: SOURCE },
    ]);
    const now = new Date("2026-02-03T04:05:06.000Z");
    await sweepSourceChecks({
      fetchGist: stubFetchGist({ [SOURCE]: makeGist(YAML_A) }),
      now: () => now,
      repository: fake.repository,
    });
    expect(fake.recorded[0]?.checkedAt).toBe(now);
  });

  test("a 404 at or below the threshold does not withdraw the row", async () => {
    const hash = sha256(YAML_A);
    const fake = fakeRepository([
      { contentHash: hash, id: "p1", notFoundStreak: 1, sourceUrl: SOURCE },
    ]);

    const summary = await sweepSourceChecks({
      fetchGist: httpFailingFetchGist(404),
      repository: fake.repository,
      // Explicitly small so the test does not need 28 fake sweeps.
      withdrawAfterNotFound: 3,
    });

    expect(fake.recorded[0]?.error).toBe("not_found");
    // Post-increment streak is 2, still below the injected threshold of 3.
    expect(fake.recordedStreak.p1).toBe(2);
    expect(fake.softDeleted).toEqual([]);
    expect(summary).toEqual({
      changed: 0,
      checked: 1,
      failed: 1,
      skipped: 0,
      withdrawn: 0,
    });
  });

  test("crossing the not-found threshold withdraws via the shared soft-delete", async () => {
    const hash = sha256(YAML_A);
    const fake = fakeRepository([
      { contentHash: hash, id: "p1", notFoundStreak: 2, sourceUrl: SOURCE },
    ]);

    const summary = await sweepSourceChecks({
      fetchGist: httpFailingFetchGist(404),
      repository: fake.repository,
      withdrawAfterNotFound: 3,
    });

    expect(fake.recorded[0]?.error).toBe("not_found");
    // The post-increment streak (3) meets the threshold, so the row converges
    // to the withdrawn state through the same soft-delete path an explicit
    // unpublish uses.
    expect(fake.recordedStreak.p1).toBe(3);
    expect(fake.softDeleted).toEqual(["p1"]);
    expect(summary).toEqual({
      changed: 0,
      checked: 1,
      failed: 1,
      skipped: 0,
      withdrawn: 1,
    });
  });

  test("a non-404 failure never withdraws, and resets the not-found run", async () => {
    const hash = sha256(YAML_A);
    for (const status of [410, 422, 451]) {
      const fake = fakeRepository([
        { contentHash: hash, id: "p1", notFoundStreak: 27, sourceUrl: SOURCE },
      ]);
      const summary = await sweepSourceChecks({
        fetchGist: httpFailingFetchGist(status),
        repository: fake.repository,
        withdrawAfterNotFound: 28,
      });

      // `unreachable` is not `not_found`: it reset the streak to 0, so even a
      // near-threshold row is never withdrawn on a non-404 answer.
      expect(fake.recorded[0]?.error).toBe("unreachable");
      expect(fake.recordedStreak.p1).toBe(0);
      expect(fake.softDeleted).toEqual([]);
      expect(summary.withdrawn).toBe(0);
    }
  });

  test("production default withdraws at WITHDRAW_NOT_FOUND_THRESHOLD", async () => {
    const hash = sha256(YAML_A);
    const fake = fakeRepository([
      {
        contentHash: hash,
        id: "p1",
        notFoundStreak: WITHDRAW_NOT_FOUND_THRESHOLD - 1,
        sourceUrl: SOURCE,
      },
    ]);
    // Absent an override, the sweep must withdraw exactly when the streak
    // crosses the constant production actually uses — not a hardcoded value
    // that drifts out of sync with `WITHDRAW_NOT_FOUND_THRESHOLD`.
    const summary = await sweepSourceChecks({
      fetchGist: httpFailingFetchGist(404),
      repository: fake.repository,
    });

    expect(fake.recorded[0]?.error).toBe("not_found");
    expect(fake.softDeleted).toEqual(["p1"]);
    expect(summary.withdrawn).toBe(1);
  });
});

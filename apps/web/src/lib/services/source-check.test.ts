import { describe, expect, test } from "bun:test";
import { sha256 } from "@oompf/core";
import type {
  ProfileRecord,
  ProfileRepository,
  SourceCheckResult,
} from "@oompf/database";
import type { GistSource } from "@oompf/github/gists";
import type { FetchPublicGist } from "./index-profile.ts";
import { DEFAULT_SWEEP_LIMIT, sweepSourceChecks } from "./source-check.ts";

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

/** A fetch seam that always rejects with the given message. */
function rejectingFetchGist(message: string): FetchPublicGist {
  return async () => {
    throw new Error(message);
  };
}

/** A simple row the sweep consumes: id, canonical source, indexed hash. */
interface SwRow {
  readonly contentHash: string;
  readonly id: string;
  readonly sourceUrl: string;
}

/**
 * An in-memory fake for the parts of {@link ProfileRepository} the sweep uses:
 * `listProfilesToCheck` and `recordSourceCheck` only, so tests stay hermetically
 * off the network and the database.
 */
function fakeRepository(rows: SwRow[]): {
  listLimit: () => number | null;
  recorded: SourceCheckResult[];
  repository: ProfileRepository;
} {
  const recorded: SourceCheckResult[] = [];
  let listLimit: number | null = null;
  const repository = {
    async listProfilesToCheck(limit?: number): Promise<ProfileRecord[]> {
      listLimit = limit ?? null;
      return rows.map((r) => r as unknown as ProfileRecord);
    },
    async recordSourceCheck(
      result: SourceCheckResult
    ): Promise<ProfileRecord | null> {
      recorded.push(result);
      return null;
    },
  } as unknown as ProfileRepository;
  return { listLimit: () => listLimit, recorded, repository };
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

    expect(summary).toEqual({ changed: 0, checked: 1, failed: 0 });
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

    expect(summary).toEqual({ changed: 1, checked: 1, failed: 0 });
    expect(fake.recorded[0]?.contentHash).toBe(newGist.contentHash);
  });

  test("a missing source records not_found, any other failure unreachable", async () => {
    const hash = sha256(YAML_A);
    const missing = fakeRepository([
      { contentHash: hash, id: "p1", sourceUrl: SOURCE },
    ]);
    await sweepSourceChecks({
      fetchGist: rejectingFetchGist("Gist d4e5 was not found"),
      repository: missing.repository,
    });

    const unreachable = fakeRepository([
      { contentHash: hash, id: "p1", sourceUrl: SOURCE },
    ]);
    await sweepSourceChecks({
      fetchGist: rejectingFetchGist(
        "fetch failed: connection reset https://example.invalid/secrets"
      ),
      repository: unreachable.repository,
    });

    expect(missing.recorded[0]?.error).toBe("not_found");
    expect(unreachable.recorded[0]?.error).toBe("unreachable");
    // The codes are a closed set; no raw error text may leak into them.
    for (const rec of [...missing.recorded, ...unreachable.recorded]) {
      // The codes are a closed set; no raw error text may leak into them.
      expect(["not_found", "unreachable"]).toContain(rec.error);
      expect(rec.error).not.toMatch(/example|reset|fetch|https?:/);
    }
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
      if (source.includes("2222")) {
        throw new Error("Gist was not found");
      }
      const gist = gists[source];
      if (gist === undefined) {
        throw new Error("Gist was not found");
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
    expect(summary).toEqual({ changed: 2, checked: 3, failed: 1 });
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
    expect(summary).toEqual({ changed: 0, checked: 2, failed: 1 });
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
});

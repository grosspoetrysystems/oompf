import { describe, expect, test } from "bun:test";

import { sha256 } from "@oompf/core";
import {
  deriveProfileId,
  type ProfileRecord,
  type ProfileRepository,
  type RegisterProfileInput,
  sameStoredValue,
  toValidationMetadata,
} from "@oompf/database";
import type { GistSource } from "@oompf/github/gists";
import type { APIContext } from "astro";
import { GET as getProfileRoute } from "../../pages/api/profiles/[id].ts";
import { POST } from "../../pages/api/profiles.ts";
import { GET as searchRoute } from "../../pages/api/search.ts";
import {
  type FetchPublicGist,
  getProfileMetadata,
  IndexError,
  indexPublicGist,
  searchIndexedProfiles,
  toCompactProfile,
  toRegisterResponse,
} from "./index-profile.ts";

/**
 * A distinctive line that only ever exists in the raw YAML body. It is not a
 * fact, so it must never survive into a stored row or any API response — a
 * canary proving canonical artifact content is never persisted or returned.
 */
const CANARY = "# canonical-body-canary-do-not-store";

const GIST_ID = "a".repeat(32);
const REV_A = "c".repeat(40);
const REV_B = "d".repeat(40);
const SOURCE = `https://gist.github.com/octocat/${GIST_ID}`;
const CANONICAL = `https://gist.github.com/${GIST_ID}`;

/** A realistic profile with searchable model/provider/advisor/hook facts. */
const VALID_YAML = `${CANARY}
name: atlas
version: "1.4.0"
modelRoles:
  main: anthropic/claude-opus
  reviewer: openai/gpt-5
advisor:
  enabled: true
hooks:
  - lint-guard
`;

/** A variant with different content (and therefore a different hash). */
const VALID_YAML_V2 = `${CANARY}
name: atlas
version: "2.0.0"
modelRoles:
  main: anthropic/claude-sonnet
`;

/** A structurally invalid artifact: a sequence root, not a mapping. */
const INVALID_YAML = "- just\n- a\n- list\n";

/** Build a resolved Gist source, defaulting the hash to match its content. */
function makeGist(overrides: Partial<GistSource> = {}): GistSource {
  const base = {
    content: VALID_YAML,
    filename: "atlas.yml",
    gistId: GIST_ID,
    htmlUrl: SOURCE,
    owner: "octocat" as string | null,
    revision: REV_A as string | null,
  };
  const merged = { ...base, ...overrides };
  return {
    ...merged,
    contentHash: overrides.contentHash ?? sha256(merged.content),
  };
}

/** A fetch seam that always resolves the given source. */
function stubFetchGist(gist: GistSource): FetchPublicGist {
  return async () => gist;
}

/** A fetch seam that always rejects, exercising error classification. */
function throwingFetchGist(message: string): FetchPublicGist {
  return async () => {
    throw new Error(message);
  };
}

/** Call counters exposed by the fake repository. */
interface RepoCalls {
  createOrUpdate: number;
  findBySource: number;
  get: number;
  search: number;
}

/**
 * An in-memory {@link ProfileRepository} mirroring the real one's idempotency
 * and — crucially — its metadata projection via {@link toValidationMetadata},
 * so the "no artifact content persisted" guarantee is faithfully exercised.
 */
function fakeRepository(): {
  repo: ProfileRepository;
  rows: Map<string, ProfileRecord>;
  calls: RepoCalls;
} {
  const rows = new Map<string, ProfileRecord>();
  const calls: RepoCalls = {
    createOrUpdate: 0,
    findBySource: 0,
    get: 0,
    search: 0,
  };

  const repo: ProfileRepository = {
    async createOrUpdateProfile(input: RegisterProfileInput) {
      calls.createOrUpdate++;
      const id = deriveProfileId(input.sourceUrl);
      const revision = input.revision ?? null;
      const validation = toValidationMetadata(input.validation);
      const existing = rows.get(id) ?? null;
      if (existing) {
        const next: ProfileRecord = {
          ...existing,
          contentHash: input.contentHash,
          facts: input.facts,
          gistId: input.gistId ?? null,
          metadata: input.metadata,
          ompVersion: input.ompVersion ?? null,
          owner: input.owner ?? null,
          profileName: input.profileName,
          revision,
          sourceType: input.sourceType,
          validation,
        };
        // Mirror the real repository: a write happens when any persisted field
        // differs, not merely when the content hash does. A fake that keys off
        // the hash alone would hide stale derived facts, which is the exact bug
        // the repository tests now cover.
        //
        // The comparison is imported rather than reimplemented. Hand-rolling it
        // here happened to agree only because `next` spreads `existing` and so
        // preserves its key order; a caller building facts in a different order
        // would make this fake disagree with the real repository, which is how a
        // double starts hiding the behaviour it stands in for.
        const unchanged = (
          [
            "contentHash",
            "facts",
            "gistId",
            "metadata",
            "ompVersion",
            "owner",
            "profileName",
            "revision",
            "sourceType",
            "validation",
          ] as const
        ).every((key) => sameStoredValue(existing[key], next[key]));
        if (unchanged) {
          return existing;
        }
        const updated: ProfileRecord = {
          ...next,
          updatedAt: new Date(existing.updatedAt.getTime() + 1000),
        };
        rows.set(id, updated);
        return updated;
      }
      const now = new Date("2026-01-01T00:00:00.000Z");
      const row: ProfileRecord = {
        contentHash: input.contentHash,
        createdAt: now,
        facts: input.facts,
        gistId: input.gistId ?? null,
        id,
        metadata: input.metadata,
        ompVersion: input.ompVersion ?? null,
        owner: input.owner ?? null,
        profileName: input.profileName,
        revision,
        sourceType: input.sourceType,
        sourceUrl: input.sourceUrl,
        updatedAt: now,
        validation,
      };
      rows.set(id, row);
      return row;
    },
    async findBySource(sourceUrl) {
      calls.findBySource++;
      for (const row of rows.values()) {
        if (row.sourceUrl === sourceUrl) {
          return row;
        }
      }
      return null;
    },
    async getProfile(id) {
      calls.get++;
      return rows.get(id) ?? null;
    },
    async searchProfiles(query) {
      calls.search++;
      const q = query.trim().toLowerCase();
      if (q === "") {
        return [];
      }
      return [...rows.values()].filter((row) =>
        JSON.stringify(row).toLowerCase().includes(q)
      );
    },
  };

  return { calls, repo, rows };
}

/** Invoke an Astro route handler with a minimal synthetic context. */
function callRoute(
  handler: (context: APIContext) => Response | Promise<Response>,
  context: Partial<APIContext>
): Promise<Response> {
  return Promise.resolve(handler(context as unknown as APIContext));
}

describe("indexPublicGist", () => {
  test("indexes a valid public Gist into a metadata record", async () => {
    const { repo, rows } = fakeRepository();
    const record = await indexPublicGist(
      { source: SOURCE },
      { fetchGist: stubFetchGist(makeGist()), repository: repo }
    );

    expect(record.id).toBe(deriveProfileId(CANONICAL));
    expect(record.sourceType).toBe("gist");
    expect(record.sourceUrl).toBe(CANONICAL);
    expect(record.gistId).toBe(GIST_ID);
    expect(record.owner).toBe("octocat");
    expect(record.profileName).toBe("atlas");
    expect(record.revision).toBe(REV_A);
    expect(record.contentHash).toBe(sha256(VALID_YAML));
    expect(record.validation.structural).toBe("valid");
    expect(record.facts.models).toContain("anthropic/claude-opus");
    expect(record.facts.providers).toContain("openai");
    expect(rows.size).toBe(1);
  });

  test("preserves the publisher-supplied OMP version", async () => {
    const { repo } = fakeRepository();
    const record = await indexPublicGist(
      { ompVersion: "0.3.1", source: SOURCE },
      { fetchGist: stubFetchGist(makeGist()), repository: repo }
    );
    expect(record.ompVersion).toBe("0.3.1");
  });

  test("rejects a structurally invalid profile before persisting", async () => {
    const { repo, calls } = fakeRepository();
    const promise = indexPublicGist(
      { source: SOURCE },
      {
        fetchGist: stubFetchGist(makeGist({ content: INVALID_YAML })),
        repository: repo,
      }
    );
    await expect(promise).rejects.toBeInstanceOf(IndexError);
    await promise.catch((error: IndexError) => {
      expect(error.code).toBe("validation_failed");
      expect(error.status).toBe(422);
      expect(error.details.length).toBeGreaterThan(0);
    });
    expect(calls.createOrUpdate).toBe(0);
  });

  test("rejects a private/missing Gist as not found", async () => {
    const { repo } = fakeRepository();
    const promise = indexPublicGist(
      { source: SOURCE },
      {
        fetchGist: throwingFetchGist(
          `Public Gist "${GIST_ID}" was not found. It may be private, deleted, or the ID may be wrong.`
        ),
        repository: repo,
      }
    );
    await promise.catch((error: IndexError) => {
      expect(error.code).toBe("source_not_found");
      expect(error.status).toBe(404);
    });
    await expect(promise).rejects.toBeInstanceOf(IndexError);
  });

  test("rejects an ambiguous Gist with multiple YAML files", async () => {
    const { repo } = fakeRepository();
    const promise = indexPublicGist(
      { source: SOURCE },
      {
        fetchGist: throwingFetchGist(
          `Gist "${GIST_ID}" contains multiple YAML files (a.yml, b.yaml); the profile source is ambiguous.`
        ),
        repository: repo,
      }
    );
    await promise.catch((error: IndexError) => {
      expect(error.code).toBe("ambiguous_source");
      expect(error.status).toBe(422);
    });
    await expect(promise).rejects.toBeInstanceOf(IndexError);
  });

  test("rejects an unsupported source before any fetch", async () => {
    const { repo, calls } = fakeRepository();
    let fetched = false;
    const spyFetch: FetchPublicGist = async () => {
      fetched = true;
      return makeGist();
    };
    const promise = indexPublicGist(
      { source: "https://github.com/octocat/repo" },
      { fetchGist: spyFetch, repository: repo }
    );
    await promise.catch((error: IndexError) => {
      expect(error.code).toBe("invalid_source");
      expect(error.status).toBe(400);
    });
    await expect(promise).rejects.toBeInstanceOf(IndexError);
    expect(fetched).toBe(false);
    expect(calls.createOrUpdate).toBe(0);
  });

  test("is idempotent for an unchanged source", async () => {
    const { repo, rows, calls } = fakeRepository();
    const first = await indexPublicGist(
      { source: SOURCE },
      { fetchGist: stubFetchGist(makeGist()), repository: repo }
    );
    const second = await indexPublicGist(
      { source: SOURCE },
      { fetchGist: stubFetchGist(makeGist()), repository: repo }
    );
    expect(second.id).toBe(first.id);
    expect(second.updatedAt.getTime()).toBe(first.updatedAt.getTime());
    expect(rows.size).toBe(1);
    expect(calls.createOrUpdate).toBe(2);
  });

  test("updates metadata when the source revision changes", async () => {
    const { repo, rows } = fakeRepository();
    const first = await indexPublicGist(
      { source: SOURCE },
      { fetchGist: stubFetchGist(makeGist()), repository: repo }
    );
    const second = await indexPublicGist(
      { source: SOURCE },
      {
        fetchGist: stubFetchGist(
          makeGist({ content: VALID_YAML_V2, revision: REV_B })
        ),
        repository: repo,
      }
    );
    expect(second.id).toBe(first.id);
    expect(second.revision).toBe(REV_B);
    expect(second.contentHash).toBe(sha256(VALID_YAML_V2));
    expect(second.updatedAt.getTime()).toBeGreaterThan(
      first.updatedAt.getTime()
    );
    expect(rows.size).toBe(1);
  });

  test("never persists canonical artifact content", async () => {
    const { repo, rows } = fakeRepository();
    const record = await indexPublicGist(
      { source: SOURCE },
      { fetchGist: stubFetchGist(makeGist()), repository: repo }
    );
    const stored = rows.get(record.id);
    expect(stored).toBeDefined();
    expect(JSON.stringify(record)).not.toContain(CANARY);
    expect("content" in record).toBe(false);
    expect("yaml" in record.validation).toBe(false);
    expect("document" in record.validation).toBe(false);
  });
});

describe("response shaping", () => {
  test("toRegisterResponse labels validation as structural", async () => {
    const { repo } = fakeRepository();
    const record = await indexPublicGist(
      { source: SOURCE },
      { fetchGist: stubFetchGist(makeGist()), repository: repo }
    );
    const response = toRegisterResponse(record);
    expect(response).toMatchObject({
      id: record.id,
      source: CANONICAL,
      url: `/p/${record.id}`,
      validation: { level: "structural", structural: "valid" },
    });
  });

  test("toCompactProfile omits facts/validation blobs", async () => {
    const { repo } = fakeRepository();
    const record = await indexPublicGist(
      { source: SOURCE },
      { fetchGist: stubFetchGist(makeGist()), repository: repo }
    );
    const compact = toCompactProfile(record);
    expect(compact.url).toBe(`/p/${record.id}`);
    expect(compact.name).toBe("atlas");
    expect(compact.models).toContain("anthropic/claude-opus");
    expect("facts" in compact).toBe(false);
    expect("validation" in compact).toBe(false);
    expect(JSON.stringify(compact)).not.toContain(CANARY);
  });
});

describe("getProfileMetadata", () => {
  test("returns a stored record", async () => {
    const { repo } = fakeRepository();
    const record = await indexPublicGist(
      { source: SOURCE },
      { fetchGist: stubFetchGist(makeGist()), repository: repo }
    );
    const fetched = await getProfileMetadata(repo, record.id);
    expect(fetched.id).toBe(record.id);
  });

  test("throws not_found for an unknown id", async () => {
    const { repo } = fakeRepository();
    const promise = getProfileMetadata(repo, "prof_missing");
    await promise.catch((error: IndexError) => {
      expect(error.code).toBe("not_found");
      expect(error.status).toBe(404);
    });
    await expect(promise).rejects.toBeInstanceOf(IndexError);
  });
});

describe("searchIndexedProfiles", () => {
  test("returns compact records matching the query", async () => {
    const { repo } = fakeRepository();
    await indexPublicGist(
      { source: SOURCE },
      { fetchGist: stubFetchGist(makeGist()), repository: repo }
    );
    const results = await searchIndexedProfiles(repo, "atlas");
    expect(results.length).toBe(1);
    expect(results[0]?.name).toBe("atlas");
    expect(results[0]?.url).toBe(`/p/${results[0]?.id}`);
  });

  test("returns an empty list for an empty query", async () => {
    const { repo } = fakeRepository();
    const results = await searchIndexedProfiles(repo, "   ");
    expect(results).toEqual([]);
  });
});

describe("POST /api/profiles", () => {
  test("returns the registration JSON shape on success", async () => {
    const { repo } = fakeRepository();
    const request = new Request("https://oompf.test/api/profiles", {
      body: JSON.stringify({ ompVersion: "0.3.1", source: SOURCE }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    const res = await callRoute(POST, {
      locals: {
        fetchGist: stubFetchGist(makeGist()),
        repository: repo,
      } as never,
      request,
    });
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      id: string;
      url: string;
      source: string;
      validation: { level: string; structural: string };
    };
    expect(json.id).toMatch(/^prof_/);
    expect(json.url).toBe(`/p/${json.id}`);
    expect(json.source).toBe(CANONICAL);
    expect(json.validation.level).toBe("structural");
    expect(json.validation.structural).toBe("valid");
  });

  test("returns a 400 error envelope for a missing source", async () => {
    const { repo } = fakeRepository();
    const request = new Request("https://oompf.test/api/profiles", {
      body: JSON.stringify({ notSource: 1 }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    const res = await callRoute(POST, {
      locals: { repository: repo } as never,
      request,
    });
    expect(res.status).toBe(400);
    const json = (await res.json()) as {
      error: { code: string; message: string };
    };
    expect(json.error.code).toBe("invalid_source");
    expect(typeof json.error.message).toBe("string");
  });

  test("returns a 422 error envelope for a structurally invalid profile", async () => {
    const { repo } = fakeRepository();
    const request = new Request("https://oompf.test/api/profiles", {
      body: JSON.stringify({ source: SOURCE }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    const res = await callRoute(POST, {
      locals: {
        fetchGist: stubFetchGist(makeGist({ content: INVALID_YAML })),
        repository: repo,
      } as never,
      request,
    });
    expect(res.status).toBe(422);
    const json = (await res.json()) as {
      error: { code: string; details?: string[] };
    };
    expect(json.error.code).toBe("validation_failed");
    expect((json.error.details ?? []).length).toBeGreaterThan(0);
  });
});

describe("GET /api/profiles/:id", () => {
  test("returns metadata only, without artifact content", async () => {
    const { repo } = fakeRepository();
    const record = await indexPublicGist(
      { source: SOURCE },
      { fetchGist: stubFetchGist(makeGist()), repository: repo }
    );
    const res = await callRoute(getProfileRoute, {
      locals: { repository: repo } as never,
      params: { id: record.id },
    });
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).not.toContain(CANARY);
    const json = JSON.parse(text) as { id: string };
    expect(json.id).toBe(record.id);
  });

  test("returns a 404 error envelope for an unknown id", async () => {
    const { repo } = fakeRepository();
    const res = await callRoute(getProfileRoute, {
      locals: { repository: repo } as never,
      params: { id: "prof_missing" },
    });
    expect(res.status).toBe(404);
    const json = (await res.json()) as { error: { code: string } };
    expect(json.error.code).toBe("not_found");
  });
});

describe("GET /api/search", () => {
  test("returns { query, results } with compact records", async () => {
    const { repo } = fakeRepository();
    await indexPublicGist(
      { source: SOURCE },
      { fetchGist: stubFetchGist(makeGist()), repository: repo }
    );
    const res = await callRoute(searchRoute, {
      locals: { repository: repo } as never,
      url: new URL("https://oompf.test/api/search?q=atlas"),
    });
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      query: string;
      results: Array<{ name: string; url: string }>;
    };
    expect(json.query).toBe("atlas");
    expect(json.results.length).toBe(1);
    expect(json.results[0]?.name).toBe("atlas");
    expect(json.results[0]?.url).toMatch(/^\/p\/prof_/);
  });
});

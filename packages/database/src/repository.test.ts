import { afterEach, describe, expect, test } from "bun:test";
import { PGlite } from "@electric-sql/pglite";
import { type ArtifactValidation, validateArtifact } from "@oompf/core";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";

import {
  clampLimit,
  createProfileRepository,
  DEFAULT_SEARCH_LIMIT,
  decodeCursor,
  deriveProfileId,
  encodeCursor,
  MAX_SEARCH_LIMIT,
  type ProfileDatabase,
  type ProfileRecord,
  type ProfileRepository,
  type RegisterProfileInput,
  toValidationMetadata,
} from "./repository.ts";
import { profiles, schema } from "./schema.ts";

/**
 * A distinctive comment line that only ever exists in the raw YAML source. It
 * is not a fact, so it must never appear anywhere in a stored row — a canary
 * proving canonical artifact content is not persisted.
 */
const SOURCE_CANARY = "# canonical-body-canary-do-not-store";

/** A realistic profile carrying searchable model/provider/advisor/hook facts. */
const PROFILE_YAML = `${SOURCE_CANARY}
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

/** A second profile with disjoint facts, used to check search selectivity. */
const OTHER_YAML = `name: beacon
modelRoles:
  main: google/gemini-pro
hooks:
  - deploy-check
`;

/**
 * Every PGlite client created by {@link freshRepo}. Tests in this file run
 * serially, so closing all of them after each test is safe and keeps the WASM
 * workers from keeping the test process alive (bun then exits 0 instead of 99).
 */
const liveClients: PGlite[] = [];

afterEach(async () => {
  await Promise.allSettled(
    liveClients.splice(0).map((client) => client.close())
  );
});

const MIGRATIONS = new URL("../migrations/", import.meta.url);

/**
 * Apply every journaled migration, in journal order — the order production
 * uses. Read from the journal rather than a hardcoded list: a list rots the
 * moment a migration is added, and the breakage then looks like a broken query
 * rather than a stale harness.
 */
async function applyMigrations(client: PGlite): Promise<void> {
  const journal = (await Bun.file(
    new URL("meta/_journal.json", MIGRATIONS)
  ).json()) as { readonly entries: readonly { readonly tag: string }[] };
  for (const entry of journal.entries) {
    const ddl = await Bun.file(new URL(`${entry.tag}.sql`, MIGRATIONS)).text();
    await client.exec(ddl);
  }
}

/**
 * Build a repository backed by a fresh in-memory Postgres (PGlite), with the
 * schema applied from the real migration SQL so the migrations are exercised too.
 */
async function freshRepo(): Promise<{
  repo: ProfileRepository;
  db: ProfileDatabase;
}> {
  const client = new PGlite();
  liveClients.push(client);
  await applyMigrations(client);
  const db = drizzle(client, { schema }) as unknown as ProfileDatabase;
  return { db, repo: createProfileRepository(db) };
}

/** Build register input from a YAML artifact, with overrides. */
function registerInput(
  yaml: string,
  overrides: Partial<RegisterProfileInput> = {}
): RegisterProfileInput {
  const validation = validateArtifact({ yaml });
  expect(validation.structural).toBe("valid");
  return {
    contentHash: validation.hash,
    facts: validation.facts!,
    gistId: "abc123def456",
    metadata: validation.metadata,
    ompVersion: "1.4.0",
    owner: "octocat",
    profileName: "atlas",
    revision: "a".repeat(40),
    sourceType: "gist",
    sourceUrl: "https://gist.github.com/octocat/abc123def456",
    validation,
    ...overrides,
  };
}

/**
 * Register `count` profiles with distinct, deterministic update times (oldest
 * first), so recency ordering is stable across test runs where `defaultNow()`
 * inserts in the same statement could otherwise collide.
 */
async function seedRecent(
  db: ProfileDatabase,
  repo: ProfileRepository,
  count: number
): Promise<ProfileRecord[]> {
  const records: ProfileRecord[] = [];
  for (let i = 0; i < count; i++) {
    const record = await repo.createOrUpdateProfile(
      registerInput(PROFILE_YAML, {
        gistId: `pr-${i}`,
        owner: `owner-${i}`,
        profileName: `pr-${i}`,
        sourceUrl: `https://gist.github.com/octocat/pr-${i}`,
      })
    );
    records.push(record);
  }
  const base = Date.UTC(2026, 0, 1);
  for (let i = 0; i < count; i++) {
    await db
      .update(profiles)
      .set({ updatedAt: new Date(base + i * 60_000) })
      .where(eq(profiles.id, records[i]!.id));
  }
  return records;
}

describe("createOrUpdateProfile", () => {
  test("first registration persists a record keyed by a stable id", async () => {
    const { repo } = await freshRepo();
    const input = registerInput(PROFILE_YAML);

    const record = await repo.createOrUpdateProfile(input);

    expect(record.id).toBe(deriveProfileId(input.sourceUrl));
    expect(record.sourceType).toBe("gist");
    expect(record.sourceUrl).toBe(input.sourceUrl);
    expect(record.owner).toBe("octocat");
    expect(record.profileName).toBe("atlas");
    expect(record.ompVersion).toBe("1.4.0");
    expect(record.revision).toBe(input.revision ?? null);
    expect(record.contentHash).toBe(input.contentHash);
    expect(record.createdAt).toBeInstanceOf(Date);
    expect(record.updatedAt).toBeInstanceOf(Date);

    expect(await repo.getProfile(record.id)).toMatchObject({ id: record.id });
    expect(await repo.findBySource(input.sourceUrl)).toMatchObject({
      id: record.id,
    });
  });

  test("re-registering the same unchanged source is idempotent", async () => {
    const { repo, db } = await freshRepo();
    const input = registerInput(PROFILE_YAML);

    const first = await repo.createOrUpdateProfile(input);
    const second = await repo.createOrUpdateProfile(input);

    expect(second.id).toBe(first.id);
    expect(second.createdAt.getTime()).toBe(first.createdAt.getTime());
    // No change means no write, so updatedAt is preserved verbatim.
    expect(second.updatedAt.getTime()).toBe(first.updatedAt.getTime());

    const all = await db.select().from(profiles);
    expect(all).toHaveLength(1);
  });

  /**
   * The bug this guards: `facts` are derived by *our* code, not carried in the
   * source. When extraction improves - as it did when model aliases stopped
   * being reported as models - re-registering the identical source has to
   * recompute them. Keying "unchanged" off the content hash alone meant every
   * row indexed before the improvement kept its wrong facts forever, and the
   * live profile page kept rendering them.
   */
  test("refreshes derived facts when extraction changes but the source does not", async () => {
    const { repo } = await freshRepo();
    const input = registerInput(PROFILE_YAML);

    const stale = await repo.createOrUpdateProfile({
      ...input,
      facts: { ...input.facts, aliases: [], models: ["@tiny"] },
    });
    expect(stale.facts.models).toEqual(["@tiny"]);

    // Identical bytes, identical revision - only the extractor got better.
    const healed = await repo.createOrUpdateProfile(input);

    expect(healed.contentHash).toBe(stale.contentHash);
    expect(healed.facts).toEqual(input.facts);
    expect(healed.facts.models).not.toEqual(["@tiny"]);
    expect(healed.createdAt.getTime()).toBe(stale.createdAt.getTime());
    expect(healed.updatedAt.getTime()).toBeGreaterThanOrEqual(
      stale.updatedAt.getTime()
    );
  });

  test("refreshes publisher metadata and validation results the same way", async () => {
    const { repo } = await freshRepo();
    const input = registerInput(PROFILE_YAML);

    await repo.createOrUpdateProfile({
      ...input,
      metadata: { ...input.metadata, summary: "a stale summary" },
    });
    const healed = await repo.createOrUpdateProfile(input);

    expect(healed.metadata.summary).toBe(input.metadata.summary);
  });

  /**
   * Postgres normalizes `jsonb` key order on write, so a value read back does
   * not match the key order it was written with. Comparing serialized JSON
   * naively would call every row changed and churn `updatedAt` forever.
   */
  test("re-registering identical data does not churn updatedAt", async () => {
    const { repo } = await freshRepo();
    const input = registerInput(PROFILE_YAML);

    const first = await repo.createOrUpdateProfile(input);
    const again = await repo.createOrUpdateProfile(input);
    const third = await repo.createOrUpdateProfile(input);

    expect(again.updatedAt.getTime()).toBe(first.updatedAt.getTime());
    expect(third.updatedAt.getTime()).toBe(first.updatedAt.getTime());
  });

  /**
   * `undefined` inside an array is not dropped the way an object entry is - JSON
   * writes it as `null`. Canonicalizing it any other way compares "[undefined]"
   * against the stored "[null]" and rewrites the row on every registration
   * without ever converging, which is the exact churn this comparison prevents.
   */
  test("an undefined array member does not cause perpetual rewrites", async () => {
    const { repo } = await freshRepo();
    const input = registerInput(PROFILE_YAML);
    const withHole = {
      ...input,
      facts: { ...input.facts, hooks: ["lint-guard", undefined] },
    } as RegisterProfileInput;

    const first = await repo.createOrUpdateProfile(withHole);
    const second = await repo.createOrUpdateProfile(withHole);

    expect(second.updatedAt.getTime()).toBe(first.updatedAt.getTime());
  });
  test("updates version metadata when the unchanged source is re-registered", async () => {
    const { repo } = await freshRepo();
    const input = registerInput(PROFILE_YAML);

    await repo.createOrUpdateProfile(input);
    const updated = await repo.createOrUpdateProfile({
      ...input,
      ompVersion: null,
    });

    expect(updated.ompVersion).toBeNull();
  });

  test("a changed revision/hash refreshes metadata but preserves first-indexed time", async () => {
    const { repo, db } = await freshRepo();
    const first = await repo.createOrUpdateProfile(registerInput(PROFILE_YAML));

    const changedYaml = `${PROFILE_YAML}extensions:\n  - cache-layer\n`;
    const changed = validateArtifact({ yaml: changedYaml });
    const second = await repo.createOrUpdateProfile(
      registerInput(changedYaml, {
        contentHash: changed.hash,
        facts: changed.facts!,
        revision: "b".repeat(40),
        validation: changed,
      })
    );

    expect(second.id).toBe(first.id);
    expect(second.revision).toBe("b".repeat(40));
    expect(second.contentHash).toBe(changed.hash);
    expect(second.contentHash).not.toBe(first.contentHash);
    // First-indexed time survives; updated time never moves backwards.
    expect(second.createdAt.getTime()).toBe(first.createdAt.getTime());
    expect(second.updatedAt.getTime()).toBeGreaterThanOrEqual(
      first.updatedAt.getTime()
    );

    const all = await db.select().from(profiles);
    expect(all).toHaveLength(1);
  });
});

describe("deriveProfileId", () => {
  test("is deterministic per source and distinct across sources", () => {
    const url = "https://gist.github.com/octocat/abc123def456";
    expect(deriveProfileId(url)).toBe(deriveProfileId(url));
    expect(deriveProfileId(url)).not.toBe(
      deriveProfileId("https://gist.github.com/octocat/999999999999")
    );
    expect(deriveProfileId(url)).toMatch(/^prof_[0-9a-f]{32}$/);
  });
});

describe("getProfile / findBySource", () => {
  test("return null for unknown ids and sources", async () => {
    const { repo } = await freshRepo();
    await repo.createOrUpdateProfile(registerInput(PROFILE_YAML));

    expect(await repo.getProfile("prof_does_not_exist")).toBeNull();
    expect(
      await repo.findBySource("https://gist.github.com/nobody/000")
    ).toBeNull();
  });
});

describe("softDeleteProfile", () => {
  test("marks deletedAt so lookups exclude the row but it survives for provenance", async () => {
    const { repo, db } = await freshRepo();
    const record = await repo.createOrUpdateProfile(
      registerInput(PROFILE_YAML)
    );
    expect(record.deletedAt).toBeNull();

    const deleted = await repo.softDeleteProfile(record.id);

    expect(deleted).not.toBeNull();
    expect(deleted!.id).toBe(record.id);
    expect(deleted!.deletedAt).toBeInstanceOf(Date);
    // Removed from read lookups...
    expect(await repo.getProfile(record.id)).toBeNull();
    expect(await repo.findBySource(record.sourceUrl)).toBeNull();
    // ...but the row still exists for provenance, marked deleted.
    const [stored] = await db
      .select()
      .from(profiles)
      .where(eq(profiles.id, record.id));
    expect(stored?.deletedAt).toBeInstanceOf(Date);
  });

  test("is idempotent and returns null for an unknown id", async () => {
    const { repo } = await freshRepo();
    const record = await repo.createOrUpdateProfile(
      registerInput(PROFILE_YAML)
    );

    const first = await repo.softDeleteProfile(record.id);
    const again = await repo.softDeleteProfile(record.id);

    expect(again).not.toBeNull();
    expect(again!.id).toBe(record.id);
    expect(again!.deletedAt).toBeInstanceOf(Date);
    expect(first!.deletedAt).toBeInstanceOf(Date);

    expect(await repo.softDeleteProfile("prof_does_not_exist")).toBeNull();
  });

  test("re-registering a withdrawn source revives its row instead of erroring", async () => {
    const { repo } = await freshRepo();
    const first = await repo.createOrUpdateProfile(registerInput(PROFILE_YAML));
    await repo.softDeleteProfile(first.id);
    expect(await repo.getProfile(first.id)).toBeNull();

    const revived = await repo.createOrUpdateProfile(
      registerInput(PROFILE_YAML)
    );

    expect(revived.id).toBe(first.id);
    expect(revived.deletedAt).toBeNull();
    expect(revived.createdAt.getTime()).toBe(first.createdAt.getTime());
    expect(await repo.getProfile(first.id)).not.toBeNull();
  });

  test("excludes soft-deleted rows from search and the recent listing", async () => {
    const { repo } = await freshRepo();
    const record = await repo.createOrUpdateProfile(
      registerInput(PROFILE_YAML)
    );
    expect((await repo.listRecent()).items.map((r) => r.id)).toContain(
      record.id
    );
    expect(
      (await repo.searchProfiles(record.profileName)).items.length
    ).toBeGreaterThan(0);

    await repo.softDeleteProfile(record.id);

    expect((await repo.listRecent()).items.map((r) => r.id)).not.toContain(
      record.id
    );
    expect((await repo.searchProfiles(record.profileName)).items).toHaveLength(
      0
    );
  });
});

describe("searchProfiles", () => {
  async function seeded(): Promise<ProfileRepository> {
    const { repo } = await freshRepo();
    await repo.createOrUpdateProfile(registerInput(PROFILE_YAML));
    await repo.createOrUpdateProfile(
      registerInput(OTHER_YAML, {
        contentHash: validateArtifact({ yaml: OTHER_YAML }).hash,
        facts: validateArtifact({ yaml: OTHER_YAML }).facts!,
        gistId: "beacon0000",
        ompVersion: null,
        owner: "ada",
        profileName: "beacon",
        sourceUrl: "https://gist.github.com/ada/beacon0000",
        validation: validateArtifact({ yaml: OTHER_YAML }),
      })
    );
    return repo;
  }

  const cases: Array<[string, string, string]> = [
    ["name", "atlas", "atlas"],
    ["owner", "octocat", "atlas"],
    ["model", "claude-opus", "atlas"],
    ["provider", "openai", "atlas"],
    ["hook fact", "lint-guard", "atlas"],
    ["other profile by provider", "google", "beacon"],
  ];

  for (const [label, query, expectedName] of cases) {
    test(`matches on ${label}`, async () => {
      const repo = await seeded();
      const results = await repo.searchProfiles(query);
      expect(results.items.map((r) => r.profileName)).toContain(expectedName);
      expect(
        results.items.every((r) => r.profileName !== otherThan(expectedName))
      ).toBe(true);
    });
  }

  /** The profile name that must NOT appear for a selective query. */
  function otherThan(name: string): string {
    return name === "atlas" ? "beacon" : "atlas";
  }

  test("a blank query lists the most recently updated profiles, newest first", async () => {
    const { repo, db } = await freshRepo();
    const records = await seedRecent(db, repo, 3);
    const results = await repo.searchProfiles("   ");
    expect(results.items.map((r) => r.id)).toEqual([
      records[2]!.id,
      records[1]!.id,
      records[0]!.id,
    ]);
    expect(results.nextCursor).toBeNull();
  });

  test("a non-blank query never exceeds the requested limit", async () => {
    const { repo, db } = await freshRepo();
    // Register four profiles whose names all match the "pr-" term.
    await seedRecent(db, repo, 4);
    const results = await repo.searchProfiles("pr-", 2);
    expect(results.items).toHaveLength(2);
  });

  test("treats LIKE wildcards as literals", async () => {
    const repo = await seeded();
    // '%' would match everything if unescaped; escaped, it matches nothing.
    expect((await repo.searchProfiles("%")).items).toEqual([]);
  });

  test("pages through a search without duplicates or gaps", async () => {
    const { repo, db } = await freshRepo();
    // Every seeded profile's name matches "pr-", so all 7 are searchable.
    const records = await seedRecent(db, repo, 7);
    const seen: string[] = [];
    let cursor: string | null = null;
    do {
      const page = await repo.searchProfiles("pr-", 3, cursor);
      seen.push(...page.items.map((r) => r.id));
      cursor = page.nextCursor;
    } while (cursor !== null);
    expect(seen).toEqual([...records].reverse().map((r) => r.id));
    expect(seen).toHaveLength(7);
  });
});

describe("listRecent", () => {
  test("returns the newest profiles first, capped at the limit", async () => {
    const { repo, db } = await freshRepo();
    const records = await seedRecent(db, repo, 4);
    const results = await repo.listRecent(2);
    expect(results.items.map((r) => r.id)).toEqual([
      records[3]!.id,
      records[2]!.id,
    ]);
  });

  test("pages through the whole set without duplicates or gaps", async () => {
    const { repo, db } = await freshRepo();
    const records = await seedRecent(db, repo, 7);
    const seen: string[] = [];
    let cursor: string | null = null;
    let pages = 0;
    do {
      const page = await repo.listRecent(3, cursor);
      seen.push(...page.items.map((r) => r.id));
      cursor = page.nextCursor;
      pages++;
    } while (cursor !== null);
    // Exactly the full set, newest first, each row exactly once.
    expect(seen).toEqual([...records].reverse().map((r) => r.id));
    expect(seen).toHaveLength(7);
    expect(new Set(seen).size).toBe(7);
    // 7 rows at 3 per page = 3 pages (3+3+1).
    expect(pages).toBe(3);
  });

  test("pages a shared-updatedAt tie group in id-desc order without dup or gap", async () => {
    const { repo, db } = await freshRepo();
    const records = await seedRecent(db, repo, 5);
    // Collapse every row to one identical updatedAt so ordering reduces to the
    // id tie-break — the exact case the (updatedAt, id) total order exists for.
    await db
      .update(profiles)
      .set({ updatedAt: new Date(Date.UTC(2026, 5, 1)) });
    const expected = records.map((r) => r.id).sort((a, b) => (a < b ? 1 : -1)); // id DESC, matching RECENT_ORDER

    const seen: string[] = [];
    let cursor: string | null = null;
    do {
      // limit 2 over 5 tied rows cuts the tie group at page boundaries.
      const page = await repo.listRecent(2, cursor);
      seen.push(...page.items.map((r) => r.id));
      cursor = page.nextCursor;
    } while (cursor !== null);

    expect(seen).toEqual(expected);
    expect(new Set(seen).size).toBe(5);
  });

  test("returns a null nextCursor on the last page", async () => {
    const { repo, db } = await freshRepo();
    await seedRecent(db, repo, 2);
    const page = await repo.listRecent(5);
    expect(page.items).toHaveLength(2);
    expect(page.nextCursor).toBeNull();
  });
});

describe("cursor encoding", () => {
  test("encodeCursor/decodeCursor round-trip a row position", () => {
    const row = {
      id: "prof_abc",
      updatedAt: new Date("2026-08-08T00:00:00.000Z"),
    };
    const encoded = encodeCursor(row);
    expect(decodeCursor(encoded)).toEqual({
      i: row.id,
      u: row.updatedAt.toISOString(),
    });
  });

  test("decodeCursor tolerates malformed or invalid values", () => {
    expect(decodeCursor(null)).toBeNull();
    expect(decodeCursor(undefined)).toBeNull();
    expect(decodeCursor("")).toBeNull();
    expect(decodeCursor("not-base64!!")).toBeNull();
    expect(decodeCursor(btoa("not json"))).toBeNull();
    expect(
      decodeCursor(btoa(JSON.stringify({ i: "x", u: "not-a-date" })))
    ).toBeNull();
    expect(decodeCursor(btoa(JSON.stringify({})))).toBeNull();
  });

  test("listRecent treats a malformed cursor as a fresh first page", async () => {
    const { repo, db } = await freshRepo();
    const records = await seedRecent(db, repo, 3);
    for (const bad of [
      "not-base64!!",
      btoa("{}"),
      btoa(JSON.stringify({ i: "x", u: "nope" })),
    ]) {
      const page = await repo.listRecent(2, bad);
      expect(page.items.map((r) => r.id)).toEqual([
        records[2]!.id,
        records[1]!.id,
      ]);
    }
  });
});

describe("clampLimit", () => {
  test("clamps or defaults a requested size", () => {
    expect(DEFAULT_SEARCH_LIMIT).toBe(50);
    expect(MAX_SEARCH_LIMIT).toBe(100);
    expect(clampLimit(undefined)).toBe(DEFAULT_SEARCH_LIMIT);
    expect(clampLimit(10)).toBe(10);
    expect(clampLimit(0)).toBe(1);
    expect(clampLimit(-5)).toBe(1);
    expect(clampLimit(1_000_000)).toBe(MAX_SEARCH_LIMIT);
    expect(clampLimit(Number.NaN)).toBe(DEFAULT_SEARCH_LIMIT);
  });
});

describe("metadata-only persistence", () => {
  test("never stores canonical artifact content", async () => {
    const { repo, db } = await freshRepo();
    const record = await repo.createOrUpdateProfile(
      registerInput(PROFILE_YAML)
    );

    const [stored] = await db.select().from(profiles);
    expect(stored).toBeDefined();

    // The row carries no content/yaml/document field at all.
    expect(Object.keys(stored!)).not.toContain("content");
    expect(Object.keys(stored!)).not.toContain("yaml");
    expect(Object.keys(stored!)).not.toContain("document");

    // Persisted validation is metadata only.
    const validation = stored!.validation as unknown as Record<string, unknown>;
    expect(Object.keys(validation)).not.toContain("yaml");
    expect(Object.keys(validation)).not.toContain("document");
    expect(Object.keys(validation)).not.toContain("facts");
    expect(validation.structural).toBe("valid");

    // The raw YAML canary never leaks into any stored column.
    expect(JSON.stringify(stored)).not.toContain(SOURCE_CANARY);
    expect(record.id).toBe(deriveProfileId(record.sourceUrl));
  });

  test("toValidationMetadata strips document and yaml fields", () => {
    const full: ArtifactValidation = validateArtifact({ yaml: PROFILE_YAML });
    const meta = toValidationMetadata(full);

    expect(meta).not.toHaveProperty("yaml");
    expect(meta).not.toHaveProperty("document");
    expect(meta).not.toHaveProperty("facts");
    expect(meta.structural).toBe("valid");
    expect(meta.hash).toBe(full.hash);
    expect(meta.byteLength).toBe(full.byteLength);
  });
});

describe("listProfilesToCheck", () => {
  test("never-checked rows first, then oldest checked, excluding soft-deleted", async () => {
    const { repo, db } = await freshRepo();
    const [older, newer, neverChecked, deleted] = await seedRecent(db, repo, 4);
    const base = Date.UTC(2026, 2, 1);
    await db
      .update(profiles)
      .set({ lastCheckedAt: new Date(base) })
      .where(eq(profiles.id, older!.id));
    await db
      .update(profiles)
      .set({ lastCheckedAt: new Date(base + 60_000) })
      .where(eq(profiles.id, newer!.id));
    await repo.softDeleteProfile(deleted!.id);

    const rows = await repo.listProfilesToCheck();

    expect(rows.map((row) => row.id)).toEqual([
      neverChecked!.id,
      older!.id,
      newer!.id,
    ]);
  });

  test("clamps its limit through clampLimit", async () => {
    const { repo, db } = await freshRepo();
    await seedRecent(db, repo, 3);

    expect(await repo.listProfilesToCheck(2)).toHaveLength(2);
    expect(await repo.listProfilesToCheck(0)).toHaveLength(1);
    expect(await repo.listProfilesToCheck()).toHaveLength(3);
  });
});

describe("recordSourceCheck", () => {
  test("matching-hash success clears failures, error, and drift", async () => {
    const { repo } = await freshRepo();
    const record = await repo.createOrUpdateProfile(
      registerInput(PROFILE_YAML)
    );

    await repo.recordSourceCheck({
      checkedAt: new Date(Date.UTC(2026, 3, 1)),
      error: "unreachable",
      id: record.id,
    });
    const drifted = await repo.recordSourceCheck({
      checkedAt: new Date(Date.UTC(2026, 3, 2)),
      contentHash: "changed-hash",
      id: record.id,
    });
    expect(drifted?.sourceChangedAt).toBeInstanceOf(Date);
    // A differing-hash fetch is still a success, so it resets the counter.
    expect(drifted?.checkFailures).toBe(0);
    expect(drifted?.lastCheckError).toBeNull();

    const cleared = await repo.recordSourceCheck({
      checkedAt: new Date(Date.UTC(2026, 3, 3)),
      contentHash: record.contentHash,
      id: record.id,
    });

    expect(cleared?.lastCheckedAt?.getTime()).toBe(
      new Date(Date.UTC(2026, 3, 3)).getTime()
    );
    expect(cleared?.checkFailures).toBe(0);
    expect(cleared?.lastCheckError).toBeNull();
    expect(cleared?.sourceChangedAt).toBeNull();
  });

  test("differing hash stamps sourceChangedAt once; repeat checks keep it", async () => {
    const { repo } = await freshRepo();
    const record = await repo.createOrUpdateProfile(
      registerInput(PROFILE_YAML)
    );
    const first = new Date(Date.UTC(2026, 4, 1, 10));
    const second = new Date(Date.UTC(2026, 4, 1, 11));

    const a = await repo.recordSourceCheck({
      checkedAt: first,
      contentHash: "drifted-1",
      id: record.id,
    });
    const b = await repo.recordSourceCheck({
      checkedAt: second,
      contentHash: "drifted-2",
      id: record.id,
    });

    // First-noticed wins: the second drift check must not move the stamp.
    expect(a?.sourceChangedAt?.getTime()).toBe(first.getTime());
    expect(b?.sourceChangedAt?.getTime()).toBe(first.getTime());
    expect(b?.lastCheckedAt?.getTime()).toBe(second.getTime());
  });

  test("failures increment checkFailures and store the code, leaving drift alone", async () => {
    const { repo } = await freshRepo();
    const record = await repo.createOrUpdateProfile(
      registerInput(PROFILE_YAML)
    );
    const drifted = await repo.recordSourceCheck({
      checkedAt: new Date(Date.UTC(2026, 5, 1)),
      contentHash: "drifted",
      id: record.id,
    });
    const driftAt = drifted!.sourceChangedAt!.getTime();

    const first = await repo.recordSourceCheck({
      checkedAt: new Date(Date.UTC(2026, 5, 2)),
      error: "not_found",
      id: record.id,
    });
    const second = await repo.recordSourceCheck({
      checkedAt: new Date(Date.UTC(2026, 5, 3)),
      error: "unreachable",
      id: record.id,
    });

    expect(first?.checkFailures).toBe(1);
    expect(first?.lastCheckError).toBe("not_found");
    expect(second?.checkFailures).toBe(2);
    expect(second?.lastCheckError).toBe("unreachable");
    expect(second?.lastCheckedAt?.getTime()).toBe(
      new Date(Date.UTC(2026, 5, 3)).getTime()
    );
    expect(second?.sourceChangedAt?.getTime()).toBe(driftAt);
  });

  test("a success after failures resets checkFailures and lastCheckError", async () => {
    const { repo } = await freshRepo();
    const record = await repo.createOrUpdateProfile(
      registerInput(PROFILE_YAML)
    );
    await repo.recordSourceCheck({
      checkedAt: new Date(Date.UTC(2026, 6, 1)),
      error: "unreachable",
      id: record.id,
    });
    await repo.recordSourceCheck({
      checkedAt: new Date(Date.UTC(2026, 6, 2)),
      error: "not_found",
      id: record.id,
    });

    const recovered = await repo.recordSourceCheck({
      checkedAt: new Date(Date.UTC(2026, 6, 3)),
      contentHash: record.contentHash,
      id: record.id,
    });

    expect(recovered?.checkFailures).toBe(0);
    expect(recovered?.lastCheckError).toBeNull();
  });

  test("never touches updatedAt, which drives recency and cursors", async () => {
    const { repo, db } = await freshRepo();
    const record = await repo.createOrUpdateProfile(
      registerInput(PROFILE_YAML)
    );
    await db
      .update(profiles)
      .set({ updatedAt: new Date(Date.UTC(2026, 7, 1)) })
      .where(eq(profiles.id, record.id));
    const before = (await repo.getProfile(record.id))!.updatedAt;

    // A failure, a drift, and a recovery: every write path of the sweep.
    await repo.recordSourceCheck({
      checkedAt: new Date(Date.UTC(2026, 7, 2)),
      error: "unreachable",
      id: record.id,
    });
    await repo.recordSourceCheck({
      checkedAt: new Date(Date.UTC(2026, 7, 3)),
      contentHash: "different-hash",
      id: record.id,
    });
    await repo.recordSourceCheck({
      checkedAt: new Date(Date.UTC(2026, 7, 4)),
      contentHash: record.contentHash,
      id: record.id,
    });

    const after = (await repo.getProfile(record.id))!.updatedAt;
    expect(after.getTime()).toBe(before.getTime());
  });

  test("returns null for an unknown id", async () => {
    const { repo } = await freshRepo();
    expect(
      await repo.recordSourceCheck({
        contentHash: "x",
        id: "prof_does_not_exist",
      })
    ).toBeNull();
  });

  test("rejects a result carrying neither contentHash nor error", async () => {
    const { repo } = await freshRepo();
    const record = await repo.createOrUpdateProfile(
      registerInput(PROFILE_YAML)
    );
    expect(repo.recordSourceCheck({ id: record.id })).rejects.toThrow(
      /neither contentHash nor error/
    );
  });
});

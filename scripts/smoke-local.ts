import { strict as assert } from "node:assert/strict";

import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import {
  BASE_URL,
  GIST_HTML,
  GIST_ID,
  ghRunner,
  gistFetch,
  jsonResponse,
  memoryFs,
  OWNER,
  REVISION,
  runCli,
  STEM,
} from "../apps/cli/src/test-helpers.ts";
import {
  getProfileMetadata,
  indexPublicGist,
  searchIndexedProfiles,
  toRegisterResponse,
} from "../apps/web/src/lib/services/index-profile.ts";
import { sha256, validateArtifact } from "../packages/core/src/index.ts";
import {
  createProfileRepository,
  type ProfileDatabase,
  type ProfileRepository,
} from "../packages/database/src/index.ts";
import { schema } from "../packages/database/src/schema.ts";
import type { GistSource } from "../packages/github/src/gists.ts";

const RAW_ONLY_CANARY = "RAW_ARTIFACT_CANARY_DO_NOT_EMIT";
const RAW_ONLY_VALUE = "RAW_ONLY_VALUE_DO_NOT_EMIT";

const PROFILE_YAML = [
  `# ${RAW_ONLY_CANARY}`,
  "symbolPreset: default",
  "setupVersion: 7",
  "modelRoles:",
  "  chat: anthropic/claude-x",
  "  review: openai/gpt-5",
  "advisor:",
  "  enabled: true",
  "hooks:",
  "  - smoke-hook",
  `unindexedCommentary: ${RAW_ONLY_VALUE}`,
  "",
].join("\n");

interface SmokeSummary {
  readonly cliLeakChecked: boolean;
  readonly collisionExitCode: number;
  readonly installedPath: string;
  readonly metadataLeakChecked: boolean;
  readonly oompfUrl: string;
  readonly profileId: string;
  readonly searchCount: number;
}

const MIGRATIONS = new URL("../packages/database/migrations/", import.meta.url);

async function freshRepository(): Promise<{
  readonly repository: ProfileRepository;
  readonly close: () => Promise<void>;
}> {
  const client = new PGlite();
  // Every journaled migration, in journal order. A hardcoded list rots on the
  // next migration and the breakage surfaces as an unreachable API rather than
  // as a stale fixture.
  const journal = (await Bun.file(
    new URL("meta/_journal.json", MIGRATIONS)
  ).json()) as { readonly entries: readonly { readonly tag: string }[] };
  for (const entry of journal.entries) {
    const ddl = await Bun.file(new URL(`${entry.tag}.sql`, MIGRATIONS)).text();
    await client.exec(ddl);
  }
  const db = drizzle(client, { schema }) as unknown as ProfileDatabase;
  return {
    close: () => client.close(),
    repository: createProfileRepository(db),
  };
}

function resolvedGist(): GistSource {
  return {
    content: PROFILE_YAML,
    contentHash: sha256(PROFILE_YAML),
    filename: `${STEM}.yml`,
    gistId: GIST_ID,
    htmlUrl: GIST_HTML,
    owner: OWNER,
    revision: REVISION,
  };
}

function assertNoRawArtifact(output: string, label: string): void {
  assert.equal(
    output.includes(RAW_ONLY_CANARY),
    false,
    `${label} leaked raw artifact canary`
  );
  assert.equal(
    output.includes(RAW_ONLY_VALUE),
    false,
    `${label} leaked raw artifact-only value`
  );
}

function assertSuccess(
  code: number | undefined,
  output: string,
  label: string
): void {
  assert.equal(code, undefined, `${label} failed: ${output}`);
}

export async function runLocalSmoke(): Promise<SmokeSummary> {
  const validation = validateArtifact({ yaml: PROFILE_YAML });
  assert.equal(validation.structural, "valid");
  assert.ok(validation.facts, "fixture should extract profile facts");

  const { repository, close } = await freshRepository();
  try {
    const store = memoryFs({
      "/omp/profiles/work/agent/config.yml": PROFILE_YAML,
    });
    const fetchGist = async () => resolvedGist();

    const httpFetch = async (
      url: string,
      init?: { method?: string; body?: string }
    ) => {
      const method = init?.method ?? "GET";
      const parsed = new URL(url);

      if (
        (parsed.pathname === "/api/profiles" ||
          parsed.pathname === "/api/v1/profiles") &&
        method === "POST"
      ) {
        const body = JSON.parse(init?.body ?? "{}");
        const record = await indexPublicGist(
          { ompVersion: body.ompVersion, source: String(body.source ?? "") },
          { fetchGist, repository }
        );
        return jsonResponse(200, toRegisterResponse(record));
      }

      if (
        (parsed.pathname.startsWith("/api/profiles/") ||
          parsed.pathname.startsWith("/api/v1/profiles/")) &&
        method === "GET"
      ) {
        const prefix = parsed.pathname.startsWith("/api/v1/")
          ? "/api/v1/profiles/"
          : "/api/profiles/";
        const id = parsed.pathname.slice(prefix.length);
        const record = await getProfileMetadata(repository, id);
        return jsonResponse(200, record);
      }

      if (
        (parsed.pathname === "/api/search" ||
          parsed.pathname === "/api/v1/search") &&
        method === "GET"
      ) {
        const query = parsed.searchParams.get("q") ?? "";
        const { results, nextCursor } = await searchIndexedProfiles(
          repository,
          query
        );
        return jsonResponse(200, { nextCursor, query, results });
      }

      return jsonResponse(404, {
        error: { code: "not_found", message: "not found" },
      });
    };

    const deps = {
      discoverProfiles: async () => [
        {
          agentDir: "/omp/profiles/work/agent",
          configPath: "/omp/profiles/work/agent/config.yml",
          name: "work",
        },
      ],
      fs: store.fs,
      gistFetch: gistFetch(PROFILE_YAML),
      httpFetch,
      resolveAgentRuntime: async () => ({
        command: "omp",
        runtime: "omp" as const,
      }),
      resolveInstallTarget: async (name: string) =>
        `/omp/profiles/${name}/agent`,
      resolveProfileConfig: async () => ({
        agentDir: "/omp/profiles/work/agent",
        configPath: "/omp/profiles/work/agent/config.yml",
        profile: "work",
      }),
      runner: ghRunner(),
    };

    const published = await runCli(deps, ["publish", "work", "--json"]);
    assertSuccess(published.code, published.out, "publish");
    assertNoRawArtifact(published.out, "publish output");
    const publishResult = JSON.parse(published.out) as {
      oompfUrl: string;
      addCommand: string;
    };
    assert.ok(publishResult.oompfUrl.startsWith(`${BASE_URL}/p/prof_`));
    assert.equal(
      publishResult.addCommand,
      `oompf add ${publishResult.oompfUrl}`
    );

    const id = publishResult.oompfUrl.slice(`${BASE_URL}/p/`.length);
    const metadata = await getProfileMetadata(repository, id);
    const metadataJson = JSON.stringify(metadata);
    assertNoRawArtifact(metadataJson, "metadata API body");
    assert.equal(metadata.profileName, STEM);
    assert.equal(metadata.contentHash, sha256(PROFILE_YAML));

    const inspected = await runCli(deps, [
      "inspect",
      publishResult.oompfUrl,
      "--json",
    ]);
    assertSuccess(inspected.code, inspected.out, "inspect");
    assertNoRawArtifact(inspected.out, "inspect output");
    const inspectResult = JSON.parse(inspected.out) as {
      sourceType: string;
      models: string[];
    };
    assert.equal(inspectResult.sourceType, "oompf");
    assert.ok(inspectResult.models.includes("anthropic/claude-x"));

    const searched = await runCli(deps, ["search", "anthropic", "--json"]);
    assertSuccess(searched.code, searched.out, "search");
    assertNoRawArtifact(searched.out, "search output");
    const searchResult = JSON.parse(searched.out) as {
      count: number;
      results: Array<{ id: string }>;
    };
    assert.equal(searchResult.count, 1);
    assert.equal(searchResult.results[0]?.id, id);

    const added = await runCli(deps, [
      "add",
      publishResult.oompfUrl,
      "--name",
      "smoke-work",
      "--json",
    ]);
    assertSuccess(added.code, added.out, "add");
    assertNoRawArtifact(added.out, "add output");
    const addResult = JSON.parse(added.out) as {
      path: string;
      command: string;
    };
    assert.equal(addResult.path, "/omp/profiles/smoke-work/agent/config.yml");
    assert.equal(addResult.command, "omp --profile smoke-work");
    assert.equal(store.files.get(addResult.path), PROFILE_YAML);
    const writesAfterInstall = store.writes.length;

    const collision = await runCli(deps, [
      "add",
      publishResult.oompfUrl,
      "--name",
      "smoke-work",
    ]);
    assert.ok((collision.code ?? 0) > 0, "second add should fail on collision");
    assert.equal(
      store.writes.length,
      writesAfterInstall,
      "collision must not write again"
    );
    assertNoRawArtifact(collision.out, "collision output");

    return {
      cliLeakChecked: true,
      collisionExitCode: collision.code ?? 0,
      installedPath: addResult.path,
      metadataLeakChecked: true,
      oompfUrl: publishResult.oompfUrl,
      profileId: id,
      searchCount: searchResult.count,
    };
  } finally {
    await close();
  }
}

if (import.meta.main) {
  const summary = await runLocalSmoke();
  console.log(JSON.stringify(summary, null, 2));
}

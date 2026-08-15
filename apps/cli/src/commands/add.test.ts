import { describe, expect, test } from "bun:test";
import type { CliDeps } from "../deps.ts";
import {
  apiFetch,
  CONTENT,
  GIST_HTML,
  GIST_ID,
  gistFetch,
  jsonResponse,
  memoryFs,
  OOMPF_URL,
  profileRecord,
  REVISION,
  runCli,
} from "../test-helpers.ts";

const AGENT_DIR = "/omp/profiles/octocat-work/agent";

function addDeps(overrides: Partial<CliDeps> = {}) {
  const store = memoryFs();
  const deps: CliDeps = {
    fs: store.fs,
    gistFetch: gistFetch(),
    httpFetch: apiFetch(),
    resolveInstallTarget: async (name) => `/omp/profiles/${name}/agent`,
    ...overrides,
  };
  return { deps, store };
}

describe("add", () => {
  test("installs from a Gist URL to the OMP-resolved target", async () => {
    const { deps, store } = addDeps();
    const { out, code } = await runCli(deps, ["add", GIST_HTML, "--json"]);
    const result = JSON.parse(out);
    expect(code).toBeUndefined();
    expect(result.name).toBe("octocat-work");
    expect(result.path).toBe(`${AGENT_DIR}/config.yml`);
    expect(result.source).toBe(GIST_HTML);
    expect(result.revision).toBe(REVISION);
    expect(result.command).toBe("omp --profile octocat-work");
    // The native config was written with restrictive permissions.
    expect(store.writes).toHaveLength(1);
    expect(store.writes[0]?.mode).toBe(0o600);
    expect(store.writes[0]?.data).toBe(CONTENT);
  });

  test("honors an explicit --name", async () => {
    const { deps } = addDeps();
    const { out, code } = await runCli(deps, [
      "add",
      GIST_HTML,
      "--name",
      "custom",
      "--json",
    ]);
    expect(code).toBeUndefined();
    const result = JSON.parse(out);
    expect(result.name).toBe("custom");
    expect(result.path).toBe("/omp/profiles/custom/agent/config.yml");
  });

  test("resolves an OOMPF ref through the metadata API", async () => {
    const { deps } = addDeps();
    const { out, code } = await runCli(deps, ["add", OOMPF_URL, "--json"]);
    expect(code).toBeUndefined();
    const result = JSON.parse(out);
    expect(result.name).toBe("octocat-work");
    expect(result.source).toBe(GIST_HTML);
  });

  test("fetches the revision indexed by an OOMPF reference", async () => {
    const urls: string[] = [];
    const fetchGist = gistFetch();
    const { deps } = addDeps({
      gistFetch: async (url) => {
        urls.push(url);
        return fetchGist(url);
      },
    });

    const { code } = await runCli(deps, ["add", OOMPF_URL, "--json"]);

    expect(code).toBeUndefined();
    expect(urls[0]).toBe(`https://api.github.com/gists/${GIST_ID}/${REVISION}`);
  });

  test("rejects an OOMPF reference whose bytes do not match the index", async () => {
    const { deps, store } = addDeps({
      httpFetch: apiFetch({
        metadata: jsonResponse(200, {
          ...profileRecord(),
          contentHash: "0".repeat(64),
        }),
      }),
    });

    const { out, code } = await runCli(deps, ["add", OOMPF_URL]);

    expect(code).toBeGreaterThan(0);
    expect(out).toContain("fingerprint_mismatch");
    expect(store.writes).toHaveLength(0);
  });

  test("rejects an OOMPF reference without a pinned revision", async () => {
    const { deps, store } = addDeps({
      httpFetch: apiFetch({
        metadata: jsonResponse(200, {
          ...profileRecord(),
          revision: null,
        }),
      }),
    });

    const { out, code } = await runCli(deps, ["add", OOMPF_URL]);

    expect(code).toBeGreaterThan(0);
    expect(out).toContain("unverifiable_artifact");
    expect(store.writes).toHaveLength(0);
  });

  test("accepts a bare Gist id", async () => {
    const { deps } = addDeps();
    const { code } = await runCli(deps, ["add", GIST_ID, "--json"]);
    expect(code).toBeUndefined();
  });

  test("refuses an existing target without writing", async () => {
    const store = memoryFs({ [`${AGENT_DIR}/config.yml`]: "old" });
    const { deps } = addDeps({ fs: store.fs });
    const { out, code } = await runCli(deps, ["add", GIST_HTML]);
    expect(code).toBeGreaterThan(0);
    expect(out).toContain("target_exists");
    expect(store.writes).toHaveLength(0);
    expect(store.files.get(`${AGENT_DIR}/config.yml`)).toBe("old");
  });

  test("rejects a missing ref argument with a nonzero exit", async () => {
    const { deps } = addDeps();
    const { code } = await runCli(deps, ["add"]);
    expect(code).toBeGreaterThan(0);
  });

  test("refuses to install a structurally invalid artifact", async () => {
    const { deps, store } = addDeps({
      gistFetch: gistFetch("- not: a mapping\n"),
    });
    const { out, code } = await runCli(deps, ["add", GIST_HTML]);
    expect(code).toBeGreaterThan(0);
    expect(out).toContain("invalid_artifact");
    expect(store.writes).toHaveLength(0);
  });

  test("refuses to install an artifact with high-confidence secrets", async () => {
    const secret = "a-real-looking-token-value";
    const { deps, store } = addDeps({
      gistFetch: gistFetch(`${CONTENT}apiKey: ${secret}\n`),
    });
    const { out, code } = await runCli(deps, ["add", GIST_HTML]);
    expect(code).toBeGreaterThan(0);
    expect(out).toContain("blocking_secrets");
    expect(store.writes).toHaveLength(0);
    // Message stays value-free: it never echoes the secret.
    expect(out).not.toContain(secret);
  });

  test("installs an artifact with a low-confidence finding, surfacing a warning", async () => {
    const { deps, store } = addDeps({
      gistFetch: gistFetch(`${CONTENT}password: "${"${DB_PASSWORD}"}"\n`),
    });
    const { out, code } = await runCli(deps, ["add", GIST_HTML, "--json"]);
    expect(code).toBeUndefined();
    expect(store.writes).toHaveLength(1);
    const result = JSON.parse(out);
    const warning = result.warnings.find((w: string) =>
      w.startsWith("password:")
    );
    expect(warning).toBeDefined();
    // The warning names only the key path — never the referenced value.
    expect(warning).not.toContain("DB_PASSWORD");
    // Prerequisites legitimately surface the environment-variable *name*
    // (value-free guidance), but the raw placeholder is never echoed.
    expect(
      result.prerequisites.some(
        (p: { kind: string; name: string }) =>
          p.kind === "environment" && p.name === "DB_PASSWORD"
      )
    ).toBe(true);
    expect(out).not.toContain("${DB_PASSWORD}");
  });

  test("surfaces the profile's prerequisites in JSON and human output", async () => {
    const { deps, store } = addDeps();
    const { out, code } = await runCli(deps, ["add", GIST_HTML, "--json"]);
    expect(code).toBeUndefined();
    expect(store.writes).toHaveLength(1);
    const result = JSON.parse(out);
    // The extracted prerequisite is surfaced value-free (name and kind, no
    // credentials or config values).
    expect(result.prerequisites).toEqual([
      {
        kind: "provider",
        name: "anthropic",
        reason:
          'Provider "anthropic" requires credentials or configuration in the local runtime.',
      },
    ]);

    const human = await runCli(addDeps().deps, ["add", GIST_HTML]);
    expect(human.code).toBeUndefined();
    expect(human.out).toContain("prerequisites");
    expect(human.out).toContain("anthropic");
  });

  test("adds no prerequisite noise for a profile without prerequisites", async () => {
    const none = gistFetch("symbolPreset: default\n");
    const { deps, store } = addDeps({ gistFetch: none });
    const { out, code } = await runCli(deps, ["add", GIST_HTML, "--json"]);
    expect(code).toBeUndefined();
    expect(store.writes).toHaveLength(1);
    const result = JSON.parse(out);
    expect(result.prerequisites).toBeUndefined();
    expect(out).not.toContain("prerequisite");

    const human = await runCli(addDeps({ gistFetch: none }).deps, [
      "add",
      GIST_HTML,
    ]);
    expect(human.code).toBeUndefined();
    expect(human.out).not.toContain("prerequisite");
  });

  test("maps a metadata API 404 to a nonzero exit", async () => {
    const { deps } = addDeps({
      httpFetch: apiFetch({
        metadata: jsonResponse(404, {
          error: { code: "not_found", message: "No indexed profile" },
        }),
      }),
    });
    const { out, code } = await runCli(deps, ["add", OOMPF_URL]);
    expect(code).toBeGreaterThan(0);
    expect(out).toContain("not_found");
  });
});

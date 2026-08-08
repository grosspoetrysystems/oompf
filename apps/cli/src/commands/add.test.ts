import { describe, expect, test } from "bun:test";

import {
  CONTENT,
  GIST_HTML,
  GIST_ID,
  OOMPF_URL,
  REVISION,
  apiFetch,
  gistFetch,
  jsonResponse,
  memoryFs,
  runCli,
} from "../test-helpers.ts";
import type { CliDeps } from "../deps.ts";

const AGENT_DIR = "/omp/profiles/octocat-work/agent";

function addDeps(overrides: Partial<CliDeps> = {}) {
  const store = memoryFs();
  const deps: CliDeps = {
    gistFetch: gistFetch(),
    httpFetch: apiFetch(),
    fs: store.fs,
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
    const { deps, store } = addDeps({ gistFetch: gistFetch("- not: a mapping\n") });
    const { out, code } = await runCli(deps, ["add", GIST_HTML]);
    expect(code).toBeGreaterThan(0);
    expect(out).toContain("invalid_artifact");
    expect(store.writes).toHaveLength(0);
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

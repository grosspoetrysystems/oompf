import { describe, expect, test } from "bun:test";
import type { CliDeps } from "../deps.ts";
import {
  apiFetch,
  CONTENT,
  GIST_HTML,
  GIST_ID,
  ghRunner,
  jsonResponse,
  memoryFs,
  OOMPF_URL,
  runCli,
} from "../test-helpers.ts";

const CONFIG_PATH = "/omp/profiles/work/agent/config.yml";
const AGENT_DIR = "/omp/profiles/work/agent";

function publishDeps(overrides: Partial<CliDeps> = {}): CliDeps {
  const { fs } = memoryFs({ [CONFIG_PATH]: CONTENT });
  return {
    discoverProfiles: async () => [
      { agentDir: AGENT_DIR, configPath: CONFIG_PATH, name: "work" },
    ],
    fs,
    httpFetch: apiFetch(),
    resolveProfileConfig: async (profile) => ({
      agentDir: AGENT_DIR,
      configPath: CONFIG_PATH,
      document: {},
      profile,
    }),
    runner: ghRunner(),
    ...overrides,
  };
}

describe("publish", () => {
  test("publishes a named profile and prints JSON metadata", async () => {
    const { out, code } = await runCli(publishDeps(), [
      "publish",
      "work",
      "--json",
    ]);
    const result = JSON.parse(out);
    expect(code).toBeUndefined();
    expect(result.profile).toBe("work");
    expect(result.githubUrl).toBe(GIST_HTML);
    expect(result.oompfUrl).toBe(OOMPF_URL);
    expect(result.gistId).toBe(GIST_ID);
    expect(result.structural).toBe("valid");
    expect(result.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(result.addCommand).toBe(`oompf add ${OOMPF_URL}`);
  });

  test("does not label setupVersion as an OMP runtime version", async () => {
    let captured = "";
    const deps = publishDeps({
      httpFetch: apiFetch({
        register: (body) => {
          captured = body;
          return jsonResponse(200, {
            id: "prof_0123456789abcdef0123456789abcdef",
            source: GIST_HTML,
            url: "/p/prof_0123456789abcdef0123456789abcdef",
            validation: {
              errors: [],
              level: "structural",
              structural: "valid",
              warnings: [],
            },
          });
        },
      }),
    });
    await runCli(deps, ["publish", "work", "--json"]);
    const sent = JSON.parse(captured);
    expect(sent.source).toBe(GIST_HTML);
    expect(sent.ompVersion).toBeUndefined();
  });

  test("human output includes a copyable install command", async () => {
    const { out, code } = await runCli(publishDeps(), ["publish", "work"]);
    expect(code).toBeUndefined();
    expect(out).toContain(`oompf add ${OOMPF_URL}`);
  });

  test("derives the sole profile when none is named", async () => {
    const { out, code } = await runCli(publishDeps(), ["publish", "--json"]);
    expect(code).toBeUndefined();
    expect(JSON.parse(out).profile).toBe("work");
  });

  test("refuses when the profile is ambiguous", async () => {
    const deps = publishDeps({
      discoverProfiles: async () => [
        { agentDir: AGENT_DIR, configPath: CONFIG_PATH, name: "work" },
        { agentDir: "/x", configPath: "/x/config.yml", name: "play" },
      ],
    });
    const { out, code } = await runCli(deps, ["publish"]);
    expect(code).toBeGreaterThan(0);
    expect(out).toContain("ambiguous_profile");
  });

  test("refuses to publish high-confidence secrets", async () => {
    const secretYaml =
      "symbolPreset: default\napiKey: sk-abcdefghijklmnopqrstuvwxyz01\n";
    const { fs } = memoryFs({ [CONFIG_PATH]: secretYaml });
    const deps = publishDeps({ fs });
    const { out, code } = await runCli(deps, ["publish", "work"]);
    expect(code).toBeGreaterThan(0);
    expect(out).toContain("blocking_secrets");
    // The secret value must never appear in output.
    expect(out).not.toContain("sk-abcdefghijklmnopqrstuvwxyz01");
  });

  test("fails with a nonzero exit when gh is not authenticated", async () => {
    const deps = publishDeps({ runner: ghRunner({ authExit: 1 }) });
    const { out, code } = await runCli(deps, ["publish", "work"]);
    expect(code).toBeGreaterThan(0);
    expect(out.toLowerCase()).toContain("auth");
  });

  test("maps a registration API error to a nonzero exit", async () => {
    const deps = publishDeps({
      httpFetch: apiFetch({
        register: () =>
          jsonResponse(422, {
            error: { code: "validation_failed", message: "bad source" },
          }),
      }),
    });
    const { out, code } = await runCli(deps, ["publish", "work"]);
    expect(code).toBeGreaterThan(0);
    expect(out).toContain("validation_failed");
  });
});

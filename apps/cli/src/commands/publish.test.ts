import { describe, expect, test } from "bun:test";
import {
  AgentRuntimeUnavailableError,
  OmpProfileNotFoundError,
} from "@oompf/core";
import type { CliDeps } from "../deps.ts";
import {
  apiFetch,
  CONTENT,
  GIST_HTML,
  GIST_ID,
  ghRunner,
  gistFetch,
  jsonResponse,
  memoryFs,
  OOMPF_URL,
  PATCHED_REVISION,
  runCli,
} from "../test-helpers.ts";

const CONFIG_PATH = "/omp/profiles/work/agent/config.yml";
const AGENT_DIR = "/omp/profiles/work/agent";
const PLAY_CONFIG_PATH = "/omp/profiles/play/agent/config.yml";
const PLAY_AGENT_DIR = "/omp/profiles/play/agent";
const PUBLICATIONS = "/home/alice/.oompf/publications.json";
const PRIOR = JSON.stringify({
  work: { filename: "work.yml", gistId: GIST_ID, source: GIST_HTML },
});

function publishDeps(
  overrides: Partial<CliDeps> = {},
  seed: Record<string, string> = {}
): CliDeps & { files: Map<string, string> } {
  const { files, fs } = memoryFs({
    [CONFIG_PATH]: CONTENT,
    [PLAY_CONFIG_PATH]: CONTENT,
    ...seed,
  });
  return {
    discoverProfiles: async () => [
      { agentDir: AGENT_DIR, configPath: CONFIG_PATH, name: "work" },
    ],
    files,
    fs,
    gistFetch: gistFetch(),
    httpFetch: apiFetch(),
    publicationsPath: PUBLICATIONS,
    resolveAgentRuntime: async () => ({
      command: "omp",
      runtime: "omp" as const,
    }),
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

/** Count and defer to the default fakes for every remote (HTTP/runner) call. */
function remoteCounters() {
  const calls = { http: 0, runner: 0 };
  return {
    calls,
    httpFetch: async (
      ...args: Parameters<NonNullable<CliDeps["httpFetch"]>>
    ) => {
      calls.http += 1;
      return apiFetch()(...args);
    },
    runner: async (...args: Parameters<NonNullable<CliDeps["runner"]>>) => {
      calls.runner += 1;
      return ghRunner()(...args);
    },
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

  test("CTA install command is emitted exactly once", async () => {
    const { out, code } = await runCli(publishDeps(), [
      "publish",
      "work",
      "--json",
    ]);
    expect(code).toBeUndefined();
    const result = JSON.parse(out);
    expect(result.cta.commands[0].command).toBe(`oompf add ${OOMPF_URL}`);
    expect(JSON.stringify(result)).not.toContain("oompf oompf");
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

  test("human output presents the link as the thing to share", async () => {
    const { out, code } = await runCli(publishDeps(), ["publish", "work"]);
    expect(code).toBeUndefined();
    expect(out).toContain(`Your link: ${OOMPF_URL}`);
    expect(out).toContain("Share it");
    expect(out).toContain(`oompf add ${OOMPF_URL}`);
    expect(out).not.toContain("oompf oompf");
  });

  test("derives the sole publishable profile when none is named", async () => {
    const deps = publishDeps({
      discoverProfiles: async () => [
        { agentDir: AGENT_DIR, configPath: CONFIG_PATH, name: "work" },
        { agentDir: "/x", configPath: null, name: "empty" },
      ],
    });
    const { out, code } = await runCli(deps, ["publish", "--json"]);
    expect(code).toBeUndefined();
    expect(JSON.parse(out).profile).toBe("work");
  });

  test("refuses when the profile is ambiguous", async () => {
    let selectedCalls = 0;
    const deps = publishDeps({
      discoverProfiles: async () => [
        { agentDir: AGENT_DIR, configPath: CONFIG_PATH, name: "work" },
        {
          agentDir: PLAY_AGENT_DIR,
          configPath: PLAY_CONFIG_PATH,
          name: "play",
        },
      ],
      profileSelector: {
        isInteractive: () => false,
        selectProfile: async () => {
          selectedCalls += 1;
          return "work";
        },
      },
    });
    const { out, code } = await runCli(deps, ["publish"]);
    expect(code).toBeGreaterThan(0);
    expect(out).toContain("ambiguous_profile");
    expect(selectedCalls).toBe(0);
  });

  test("selects among multiple publishable profiles interactively", async () => {
    const selected: string[][] = [];
    const deps = publishDeps({
      discoverProfiles: async () => [
        {
          agentDir: PLAY_AGENT_DIR,
          configPath: PLAY_CONFIG_PATH,
          name: "play",
        },
        { agentDir: AGENT_DIR, configPath: CONFIG_PATH, name: "work" },
        { agentDir: "/x", configPath: null, name: "empty" },
      ],
      profileSelector: {
        isInteractive: () => true,
        selectProfile: async (names) => {
          selected.push([...names]);
          return "play";
        },
      },
    });

    const { out, code } = await runCli(deps, ["publish"]);
    expect(code).toBeUndefined();
    expect(out).toContain("play");
    // Only profiles with a config are offered, in discovery (sorted) order.
    expect(selected).toEqual([["play", "work"]]);
  });

  test("maps selector cancellation before remote side effects", async () => {
    const remote = remoteCounters();
    const deps = publishDeps({
      discoverProfiles: async () => [
        {
          agentDir: PLAY_AGENT_DIR,
          configPath: PLAY_CONFIG_PATH,
          name: "play",
        },
        { agentDir: AGENT_DIR, configPath: CONFIG_PATH, name: "work" },
      ],
      httpFetch: remote.httpFetch,
      profileSelector: {
        isInteractive: () => true,
        selectProfile: async () => null,
      },
      runner: remote.runner,
    });

    const { out, code } = await runCli(deps, ["publish"]);
    expect(code).toBeGreaterThan(0);
    expect(out).toContain("selection_cancelled");
    expect(remote.calls).toEqual({ http: 0, runner: 0 });
  });

  test("rejects a selector-selected name that was not offered", async () => {
    const remote = remoteCounters();
    const deps = publishDeps({
      discoverProfiles: async () => [
        {
          agentDir: PLAY_AGENT_DIR,
          configPath: PLAY_CONFIG_PATH,
          name: "play",
        },
        { agentDir: AGENT_DIR, configPath: CONFIG_PATH, name: "work" },
      ],
      httpFetch: remote.httpFetch,
      profileSelector: {
        isInteractive: () => true,
        selectProfile: async () => "ghost",
      },
      runner: remote.runner,
    });

    const { out, code } = await runCli(deps, ["publish"]);
    expect(code).toBeGreaterThan(0);
    expect(out).toContain("selection_invariant");
    expect(remote.calls).toEqual({ http: 0, runner: 0 });
  });

  test("explicit --json refuses ambiguity without invoking the selector", async () => {
    let selectedCalls = 0;
    const deps = publishDeps({
      discoverProfiles: async () => [
        { agentDir: AGENT_DIR, configPath: CONFIG_PATH, name: "work" },
        {
          agentDir: PLAY_AGENT_DIR,
          configPath: PLAY_CONFIG_PATH,
          name: "play",
        },
      ],
      profileSelector: {
        isInteractive: () => true,
        selectProfile: async () => {
          selectedCalls += 1;
          return "work";
        },
      },
    });
    const { out, code } = await runCli(deps, ["publish", "--json"]);
    expect(code).toBeGreaterThan(0);
    expect(out).toContain("ambiguous_profile");
    expect(selectedCalls).toBe(0);
  });

  test("reports no_profile when no publishable profiles exist", async () => {
    const deps = publishDeps({
      discoverProfiles: async () => [
        { agentDir: "/x", configPath: null, name: "empty" },
      ],
    });
    const { out, code } = await runCli(deps, ["publish"]);
    expect(code).toBeGreaterThan(0);
    expect(out).toContain("no_profile");
  });

  test("maps an invalid path-like input to invalid_profile", async () => {
    const remote = remoteCounters();
    let resolved = false;
    const deps = publishDeps({
      httpFetch: remote.httpFetch,
      resolveProfileConfig: async (profile) => {
        resolved = true;
        return {
          agentDir: AGENT_DIR,
          configPath: CONFIG_PATH,
          document: {},
          profile,
        };
      },
      runner: remote.runner,
    });

    const { out, code } = await runCli(deps, ["publish", "./work.yml"]);
    expect(code).toBeGreaterThan(0);
    expect(out).toContain("invalid_profile");
    expect(resolved).toBe(false);
    expect(remote.calls).toEqual({ http: 0, runner: 0 });
  });

  test("maps an absent named profile to profile_not_found", async () => {
    const remote = remoteCounters();
    const missingPath = "/omp/profiles/ghost/agent";
    const deps = publishDeps({
      httpFetch: remote.httpFetch,
      resolveProfileConfig: async () => {
        throw new OmpProfileNotFoundError("ghost", missingPath);
      },
      runner: remote.runner,
    });

    const { out, code } = await runCli(deps, ["publish", "ghost"]);
    expect(code).toBeGreaterThan(0);
    expect(out).toContain("profile_not_found");
    expect(remote.calls).toEqual({ http: 0, runner: 0 });
  });

  test("maps an existing profile without config to missing_config", async () => {
    const remote = remoteCounters();
    const deps = publishDeps({
      httpFetch: remote.httpFetch,
      resolveProfileConfig: async (profile) => ({
        agentDir: AGENT_DIR,
        configPath: null,
        document: null,
        profile,
      }),
      runner: remote.runner,
    });

    const { out, code } = await runCli(deps, ["publish", "work"]);
    expect(code).toBeGreaterThan(0);
    expect(out).toContain("missing_config");
    expect(remote.calls).toEqual({ http: 0, runner: 0 });
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

  test("--agent pi reaches runtime resolution and flows the binary to the profile resolver", async () => {
    let requested: unknown;
    const deps = publishDeps({
      resolveAgentRuntime: async (options) => {
        requested = options?.requested;
        return { command: "pi", runtime: "pi" as const };
      },
      resolveProfileConfig: async (profile, options) => {
        expect(options?.ompCommand).toBe("pi");
        return {
          agentDir: AGENT_DIR,
          configPath: CONFIG_PATH,
          document: {},
          profile,
        };
      },
    });
    const { out, code } = await runCli(deps, [
      "publish",
      "work",
      "--agent",
      "pi",
      "--json",
    ]);
    expect(code).toBeUndefined();
    expect(requested).toBe("pi");
    const result = JSON.parse(out);
    expect(result.profile).toBe("work");
  });

  test("maps an absent agent runtime to agent_not_found", async () => {
    const deps = publishDeps({
      resolveAgentRuntime: async () => {
        throw new AgentRuntimeUnavailableError("No agent runtime installed.");
      },
    });
    const { out, code } = await runCli(deps, ["publish", "work"]);
    expect(code).toBeGreaterThan(0);
    expect(out).toContain("agent_not_found");
    expect(out).not.toContain("ENOENT");
  });

  test("a pinned omp binary short-circuits runtime detection", async () => {
    let probed = false;
    const deps = publishDeps({
      ompCommand: "pinned-omp",
      resolveAgentRuntime: async () => {
        probed = true;
        return { command: "omp", runtime: "omp" as const };
      },
      resolveProfileConfig: async (profile, options) => {
        expect(options?.ompCommand).toBe("pinned-omp");
        return {
          agentDir: AGENT_DIR,
          configPath: CONFIG_PATH,
          document: {},
          profile,
        };
      },
    });
    const { code } = await runCli(deps, ["publish", "work", "--json"]);
    expect(code).toBeUndefined();
    expect(probed).toBe(false);
  });

  test("records the published Gist so the identity can be reused", async () => {
    const deps = publishDeps();
    const { code } = await runCli(deps, ["publish", "work", "--json"]);
    expect(code).toBeUndefined();
    expect(JSON.parse(deps.files.get(PUBLICATIONS) ?? "{}")).toEqual({
      work: { filename: "work.yml", gistId: GIST_ID, source: GIST_HTML },
    });
  });

  test("a repeat publish patches the same Gist and keeps the same link", async () => {
    const ghCalls: string[][] = [];
    const deps = publishDeps(
      {
        httpFetch: apiFetch({
          register: (body) => {
            expect(JSON.parse(body).source).toBe(GIST_HTML);
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
        runner: async (input) => {
          ghCalls.push([...input.args]);
          return await ghRunner()(input);
        },
      },
      { [PUBLICATIONS]: PRIOR }
    );

    const { out, code } = await runCli(deps, ["publish", "work", "--json"]);
    expect(code).toBeUndefined();
    const result = JSON.parse(out);
    expect(result.publication).toBe("updated");
    expect(result.oompfUrl).toBe(OOMPF_URL);
    expect(result.revision).toBe(PATCHED_REVISION);
    expect(ghCalls.some((args) => args[0] === "gist")).toBe(false);
    expect(
      ghCalls.some(
        (args) => args[1] === "--method" && args[3] === `gists/${GIST_ID}`
      )
    ).toBe(true);
  });

  test("--new publishes a separate Gist despite a recorded identity", async () => {
    const deps = publishDeps({}, { [PUBLICATIONS]: PRIOR });
    const { out, code } = await runCli(deps, [
      "publish",
      "work",
      "--new",
      "--json",
    ]);
    expect(code).toBeUndefined();
    expect(JSON.parse(out).publication).toBe("created");
  });

  test("refuses to fork when the recorded Gist is gone", async () => {
    const deps = publishDeps(
      { gistFetch: async () => jsonResponse(404, "not found") },
      { [PUBLICATIONS]: PRIOR }
    );
    const { out, code } = await runCli(deps, ["publish", "work", "--json"]);
    expect(code).toBe(1);
    expect(out).toContain("missing_gist");
  });

  test("refuses to fork when the recorded Gist belongs to someone else", async () => {
    const deps = publishDeps(
      {
        gistFetch: async () =>
          jsonResponse(
            200,
            JSON.stringify({
              files: {
                "work.yml": {
                  content: CONTENT,
                  filename: "work.yml",
                  raw_url: null,
                },
              },
              history: [{ version: PATCHED_REVISION }],
              html_url: GIST_HTML,
              owner: { login: "someone-else" },
            })
          ),
      },
      { [PUBLICATIONS]: PRIOR }
    );
    const { out, code } = await runCli(deps, ["publish", "work", "--json"]);
    expect(code).toBe(1);
    expect(out).toContain("unowned_gist");
  });

  test("an unreadable publication store degrades to a new publication", async () => {
    const deps = publishDeps({}, { [PUBLICATIONS]: "{ not json" });
    const { out, code } = await runCli(deps, ["publish", "work", "--json"]);
    expect(code).toBeUndefined();
    expect(JSON.parse(out).publication).toBe("created");
    expect(JSON.parse(deps.files.get(PUBLICATIONS) ?? "")).toEqual({
      work: { filename: "work.yml", gistId: GIST_ID, source: GIST_HTML },
    });
  });

  test("a patched Gist with a failed re-index says the Gist is already current", async () => {
    const deps = publishDeps(
      {
        httpFetch: apiFetch({
          register: () => jsonResponse(503, { error: { message: "down" } }),
        }),
      },
      { [PUBLICATIONS]: PRIOR }
    );
    const { out, code } = await runCli(deps, ["publish", "work", "--json"]);
    expect(code).toBe(1);
    expect(out).toContain("index_update_failed");
    expect(out).toContain(GIST_HTML);
  });
});

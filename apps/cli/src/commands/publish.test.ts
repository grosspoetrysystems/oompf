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
  jsonResponse,
  memoryFs,
  OOMPF_URL,
  runCli,
} from "../test-helpers.ts";

const CONFIG_PATH = "/omp/profiles/work/agent/config.yml";
const AGENT_DIR = "/omp/profiles/work/agent";
const PLAY_CONFIG_PATH = "/omp/profiles/play/agent/config.yml";
const PLAY_AGENT_DIR = "/omp/profiles/play/agent";

function publishDeps(overrides: Partial<CliDeps> = {}): CliDeps {
  const { fs } = memoryFs({
    [CONFIG_PATH]: CONTENT,
    [PLAY_CONFIG_PATH]: CONTENT,
  });
  return {
    discoverProfiles: async () => [
      { agentDir: AGENT_DIR, configPath: CONFIG_PATH, name: "work" },
    ],
    fs,
    httpFetch: apiFetch(),
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

  test("human output includes a copyable install command", async () => {
    const { out, code } = await runCli(publishDeps(), ["publish", "work"]);
    expect(code).toBeUndefined();
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
});

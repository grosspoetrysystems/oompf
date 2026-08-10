import { afterEach, beforeAll, describe, expect, test } from "bun:test";
import { chmod, mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  discoverProfiles,
  resolveInstallTarget,
  resolveProfileConfig,
} from "./omp-profile.ts";

/**
 * A stub standing in for the real `omp` binary. It echoes a path chosen by the
 * test through environment variables, which lets these tests assert both path
 * resolution and that OOMPF propagates the process environment to the child:
 *   - `omp --profile <name> config path` -> prints $OOMPF_STUB_PROFILE_DIR
 *     (or exits non-zero when $OOMPF_STUB_EXIT=1)
 *   - `omp config path`                  -> prints $OOMPF_STUB_DEFAULT_DIR
 */
const STUB_SCRIPT = `#!/bin/sh
if [ "$1" = "--profile" ]; then
  if [ "$OOMPF_STUB_EXIT" = "1" ]; then
    printf 'stub failure\\n' >&2
    exit 3
  fi
  printf '%s\\n' "$OOMPF_STUB_PROFILE_DIR"
else
  printf '%s\\n' "$OOMPF_STUB_DEFAULT_DIR"
fi
`;

let stubCommand: string;
const stubEnvKeys = [
  "OOMPF_STUB_PROFILE_DIR",
  "OOMPF_STUB_DEFAULT_DIR",
  "OOMPF_STUB_EXIT",
] as const;

async function makeTempDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), "oompf-omp-profile-"));
}

beforeAll(async () => {
  const dir = await makeTempDir();
  stubCommand = join(dir, "omp-stub.sh");
  await writeFile(stubCommand, STUB_SCRIPT);
  await chmod(stubCommand, 0o755);
});

afterEach(() => {
  for (const key of stubEnvKeys) {
    delete process.env[key];
  }
});

describe("resolveInstallTarget", () => {
  test("resolves a non-existent profile to its (not-yet-created) agent dir", async () => {
    // Path deliberately does not exist: an install target need not be present.
    const target = join(tmpdir(), "oompf-absent-123456", "agent");
    process.env.OOMPF_STUB_PROFILE_DIR = target;

    const resolved = await resolveInstallTarget("brandnew", {
      ompCommand: stubCommand,
    });
    expect(resolved).toBe(target);
  });

  test("rejects an invalid profile name before invoking OMP", async () => {
    process.env.OOMPF_STUB_PROFILE_DIR = join(tmpdir(), "unused");
    await expect(
      resolveInstallTarget("BAD_UPPER", { ompCommand: stubCommand })
    ).rejects.toThrow(/must match/);
  });

  test("propagates the process environment to the OMP subprocess", async () => {
    // The stub can only echo this sentinel path if the env var reached the
    // child process, so a correct result proves environment propagation.
    const sentinel = await makeTempDir();
    process.env.OOMPF_STUB_PROFILE_DIR = sentinel;

    const resolved = await resolveInstallTarget("envcheck", {
      ompCommand: stubCommand,
    });
    expect(resolved).toBe(sentinel);
  });

  test("rejects when OMP exits non-zero", async () => {
    process.env.OOMPF_STUB_PROFILE_DIR = join(tmpdir(), "unused");
    process.env.OOMPF_STUB_EXIT = "1";
    await expect(
      resolveInstallTarget("boom", { ompCommand: stubCommand })
    ).rejects.toThrow(/OMP failed to resolve/);
  });
});

describe("resolveProfileConfig", () => {
  test("prefers config.yml over config.yaml when both exist", async () => {
    const agentDir = await makeTempDir();
    await writeFile(join(agentDir, "config.yml"), "which: yml\n");
    await writeFile(join(agentDir, "config.yaml"), "which: yaml\n");
    process.env.OOMPF_STUB_PROFILE_DIR = agentDir;

    const result = await resolveProfileConfig("work", {
      ompCommand: stubCommand,
    });
    expect(result.configPath).toBe(join(agentDir, "config.yml"));
    expect(result.document).toEqual({ which: "yml" });
  });

  test("falls back to config.yaml when config.yml is absent", async () => {
    const agentDir = await makeTempDir();
    await writeFile(join(agentDir, "config.yaml"), "which: yaml\n");
    process.env.OOMPF_STUB_PROFILE_DIR = agentDir;

    const result = await resolveProfileConfig("work", {
      ompCommand: stubCommand,
    });
    expect(result.configPath).toBe(join(agentDir, "config.yaml"));
    expect(result.document).toEqual({ which: "yaml" });
  });

  test("returns a null document when no config file exists", async () => {
    const agentDir = await makeTempDir();
    process.env.OOMPF_STUB_PROFILE_DIR = agentDir;

    const result = await resolveProfileConfig("work", {
      ompCommand: stubCommand,
    });
    expect(result.configPath).toBeNull();
    expect(result.document).toBeNull();
  });

  test("preserves unknown keys from the config document", async () => {
    const agentDir = await makeTempDir();
    await writeFile(
      join(agentDir, "config.yml"),
      "model: opus\nnested:\n  future_flag: true\nunknown_key: 42\n"
    );
    process.env.OOMPF_STUB_PROFILE_DIR = agentDir;

    const result = await resolveProfileConfig("work", {
      ompCommand: stubCommand,
    });
    expect(result.document).toEqual({
      model: "opus",
      nested: { future_flag: true },
      unknown_key: 42,
    });
  });

  test("rejects a missing profile (agent directory does not exist)", async () => {
    process.env.OOMPF_STUB_PROFILE_DIR = join(
      tmpdir(),
      "oompf-missing-profile-987654",
      "agent"
    );
    await expect(
      resolveProfileConfig("ghost", { ompCommand: stubCommand })
    ).rejects.toThrow(/is not a directory/);
  });

  test("rejects a config whose YAML root is not a mapping", async () => {
    const agentDir = await makeTempDir();
    await writeFile(join(agentDir, "config.yml"), "- one\n- two\n");
    process.env.OOMPF_STUB_PROFILE_DIR = agentDir;

    await expect(
      resolveProfileConfig("work", { ompCommand: stubCommand })
    ).rejects.toThrow(/mapping at its root/);
  });

  test("rejects an invalid profile name before invoking OMP", async () => {
    await expect(
      resolveProfileConfig("..", { ompCommand: stubCommand })
    ).rejects.toThrow(/"\." or "\.\."/);
  });
});

describe("discoverProfiles", () => {
  test("lists valid profiles under OMP's resolved root, skipping the rest", async () => {
    const root = await makeTempDir();
    const defaultAgent = join(root, "agent");
    await mkdir(defaultAgent, { recursive: true });
    const profilesRoot = join(root, "profiles");

    // alpha: valid, has config.yml
    await mkdir(join(profilesRoot, "alpha", "agent"), { recursive: true });
    await writeFile(
      join(profilesRoot, "alpha", "agent", "config.yml"),
      "model: opus\n"
    );
    // beta: valid, no config file
    await mkdir(join(profilesRoot, "beta", "agent"), { recursive: true });
    // BAD_UP: invalid name (uppercase) -> skipped
    await mkdir(join(profilesRoot, "BAD_UP", "agent"), { recursive: true });
    // gamma: valid name but no agent subdirectory -> skipped
    await mkdir(join(profilesRoot, "gamma"), { recursive: true });
    // stray file (not a directory) -> ignored
    await writeFile(join(profilesRoot, "notes.txt"), "ignore me\n");

    process.env.OOMPF_STUB_DEFAULT_DIR = defaultAgent;

    const profiles = await discoverProfiles({ ompCommand: stubCommand });
    expect(profiles.map((profile) => profile.name)).toEqual(["alpha", "beta"]);

    const [alpha, beta] = profiles;
    expect(alpha?.agentDir).toBe(join(profilesRoot, "alpha", "agent"));
    expect(alpha?.configPath).toBe(
      join(profilesRoot, "alpha", "agent", "config.yml")
    );
    expect(beta?.configPath).toBeNull();
  });

  test("returns an empty list when the profiles directory is absent", async () => {
    const root = await makeTempDir();
    const defaultAgent = join(root, "agent");
    await mkdir(defaultAgent, { recursive: true });
    process.env.OOMPF_STUB_DEFAULT_DIR = defaultAgent;

    const profiles = await discoverProfiles({ ompCommand: stubCommand });
    expect(profiles).toEqual([]);
  });
});

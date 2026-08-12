/**
 * Smoke the *published* package, the way a consumer receives it.
 *
 * This installs from the registry into a throwaway directory and runs the
 * binary. It deliberately does not touch the repository's build output: the
 * whole point is to catch defects that only exist once npm serves the package.
 *
 * Usage:
 *   bun scripts/smoke-published.ts             # version from apps/cli/package.json
 *   bun scripts/smoke-published.ts 0.1.1       # explicit version
 *
 * Two things make this reliable enough to gate a release on:
 *
 *  1. A newly published version is not immediately readable. Propagation took
 *     over a minute for 0.1.1, so this waits minutes, not seconds.
 *  2. npm caches the packument it fetched on the first attempt, so a naive
 *     retry loop re-reads metadata that predates the publish and fails
 *     identically until it gives up. Every attempt therefore uses a fresh cache
 *     and `--prefer-online`, which forces revalidation.
 */

import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnCapture } from "@oompf/core";

const REGISTRY = "https://registry.npmjs.org/";
const ATTEMPTS = 12;
const WAIT_MS = 15_000;

const manifest = (await import("../apps/cli/package.json", {
  with: { type: "json" },
})) as { default: { name: string; version: string } };

const name = manifest.default.name;
const version = process.argv[2] ?? manifest.default.version;
const spec = `${name}@${version}`;

const sleep = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

const workspace = await mkdtemp(join(tmpdir(), "oompf-smoke-"));

try {
  // A pristine config: no auth, no inherited registry override, nothing this
  // repository's own npmrc might contribute. A consumer has none of that.
  const userconfig = join(workspace, ".npmrc");
  await writeFile(userconfig, `registry=${REGISTRY}\n`);

  await writeFile(
    join(workspace, "package.json"),
    `${JSON.stringify({ name: "oompf-smoke", private: true }, null, 2)}\n`
  );

  // npm inherits configuration from the environment as well as from files, so
  // the parent's registry/auth settings are removed rather than merely
  // overridden. A consumer's shell has none of them.
  const childEnv = { ...process.env };
  for (const key of Object.keys(childEnv)) {
    if (key.startsWith("NPM_CONFIG_") || key === "NODE_AUTH_TOKEN") {
      delete childEnv[key];
    }
  }

  let installed = false;
  let lastError = "";

  for (let attempt = 1; attempt <= ATTEMPTS; attempt += 1) {
    // A fresh cache per attempt: reusing one means reusing the packument
    // fetched before the version existed.
    const cache = await mkdtemp(join(tmpdir(), "oompf-smoke-cache-"));
    const { exitCode, stderr } = await spawnCapture({
      args: [
        "install",
        spec,
        "--prefer-online",
        "--no-audit",
        "--no-fund",
        `--prefix=${workspace}`,
        `--cache=${cache}`,
        `--userconfig=${userconfig}`,
      ],
      command: "npm",
      env: childEnv,
    });
    await rm(cache, { force: true, recursive: true });

    if (exitCode === 0) {
      installed = true;
      process.stdout.write(`installed ${spec} on attempt ${attempt}\n`);
      break;
    }

    lastError = stderr.trim();
    if (attempt < ATTEMPTS) {
      process.stdout.write(
        `attempt ${attempt}/${ATTEMPTS}: not installable yet, waiting\n`
      );
      await sleep(WAIT_MS);
    }
  }

  assert.ok(
    installed,
    `${spec} did not become installable after ${ATTEMPTS} attempts over ${
      (ATTEMPTS * WAIT_MS) / 60_000
    } minutes.\nLast npm error:\n${lastError}`
  );

  // The package name is scoped; the command is not.
  const binary = join(workspace, "node_modules", ".bin", "oompf");
  const reported = await spawnCapture({ args: ["--version"], command: binary });

  assert.equal(
    reported.exitCode,
    0,
    `published binary failed to run: ${reported.stderr.trim()}`
  );
  assert.equal(
    reported.stdout.trim(),
    version,
    `published binary reports "${reported.stdout.trim()}" but the package is ${version}`
  );

  const help = await spawnCapture({ args: ["--help"], command: binary });
  assert.equal(help.exitCode, 0, "published binary could not print help");
  for (const command of ["publish", "add", "inspect", "search"]) {
    assert.ok(
      help.stdout.includes(command),
      `published binary does not advertise "${command}"`
    );
  }

  process.stdout.write(
    `published ok: ${spec} installs, runs, reports ${version}\n`
  );
} finally {
  await rm(workspace, { force: true, recursive: true });
}

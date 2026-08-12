/**
 * Guard the published CLI tarball.
 *
 * `apps/cli/dist` holds two emit systems: tsdown's bundle and `tsc -b`'s
 * per-file declarations for the composite build, tests included. A `files`
 * entry of `["dist"]` therefore shipped 35 files, among them `add.test.d.ts`.
 * The manifest now lists exactly what consumers get, and this check keeps that
 * list honest — packaging mistakes are invisible until someone installs.
 *
 * Also asserts the properties that make the package usable at all: an
 * executable JavaScript `bin` (not TypeScript source), no `workspace:`
 * protocol left in `dependencies` (it does not resolve outside the monorepo),
 * and a `bin` entry that actually exists in the tarball.
 */

import { strict as assert } from "node:assert/strict";
import { spawnCapture } from "@oompf/core";

const CLI_DIR = new URL("../apps/cli/", import.meta.url).pathname;

/**
 * Exactly what a consumer should receive. Update deliberately, never blindly.
 *
 * `README.md` and `LICENSE` are not in the manifest's `files` list — npm always
 * includes them from the package directory. The LICENSE is a copy of the root
 * one, because npm does not look outside the package being packed and the
 * manifest claims MIT.
 */
const EXPECTED_FILES = [
  "LICENSE",
  "README.md",
  "dist/index.d.mts",
  "dist/index.d.mts.map",
  "dist/index.mjs",
  "dist/index.mjs.map",
  "package.json",
] as const;

interface PackEntry {
  readonly path: string;
}

interface PackReport {
  readonly files: readonly PackEntry[];
  readonly name: string;
  readonly version: string;
}

// `./apps/cli` must stay path-like: `npm pack apps/cli` is read as a package
// spec and sent to the network as a git remote.
const { exitCode, stderr, stdout } = await spawnCapture({
  args: ["pack", "--dry-run", "--json", "./apps/cli"],
  command: "npm",
  env: { ...process.env },
});
assert.equal(exitCode, 0, `npm pack failed: ${stderr}`);

// npm prints the JSON report on stdout and its human notices on stderr.
const [report] = JSON.parse(stdout) as PackReport[];
assert.ok(report, "npm pack produced no report");

const shipped = report.files.map((file) => file.path).sort();

const manifest = (await import(`${CLI_DIR}package.json`, {
  with: { type: "json" },
})) as { default: Record<string, unknown> };
const pkg = manifest.default;

// Manifest checks run before the file list: a bad manifest can perturb what
// npm reports, and "workspace protocol in dependencies" is a far more useful
// message than "the file list changed".
assert.equal(pkg.private, undefined, "package must not be private to publish");

const dependencies = (pkg.dependencies ?? {}) as Record<string, string>;
for (const [name, range] of Object.entries(dependencies)) {
  assert.ok(
    !range.startsWith("workspace:"),
    `dependency "${name}" uses the workspace protocol, which will not resolve for consumers; bundle it or publish it`
  );
}

const bin = pkg.bin as Record<string, string> | undefined;
assert.ok(bin?.oompf, "package.json must declare a bin entry named oompf");
assert.match(
  bin.oompf,
  /\.mjs$/,
  `bin must point at built JavaScript, got "${bin.oompf}"`
);

assert.deepEqual(
  shipped,
  [...EXPECTED_FILES].sort(),
  `Published file list changed.\n  expected: ${EXPECTED_FILES.join(", ")}\n  actual:   ${shipped.join(", ")}\nIf this is intended, update EXPECTED_FILES in scripts/check-package.ts.`
);

assert.ok(
  shipped.includes(bin.oompf.replace(/^\.\//, "")),
  `bin "${bin.oompf}" is not present in the tarball`
);

process.stdout.write(
  `package ok: ${report.name}@${report.version}, ${shipped.length} files, bin ${bin.oompf}\n`
);

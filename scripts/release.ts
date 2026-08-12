/**
 * Cut a CLI release.
 *
 * The version is derived from the conventional commits since the last release
 * tag, which the repository already enforces through commitlint. Nothing about
 * a release is typed twice: the manifest is the only version, the tag is
 * computed from it, and `CLI_VERSION` is read from it at build time.
 *
 * Usage:
 *   bun run release                 # preview: what would be released, and why
 *   bun run release --yes           # do it
 *   bun run release minor --yes     # override the derived bump
 *
 * Preview is the default because publishing cannot be undone after 72 hours.
 */

import { spawnCapture } from "@oompf/core";

const MANIFEST = "apps/cli/package.json";
const TAG_PREFIX = "cli-v";

/** A commit's release-relevant shape, parsed from its subject and body. */
export interface ReleaseCommit {
  readonly breaking: boolean;
  readonly hash: string;
  readonly subject: string;
  readonly type: string;
}

/** How much to raise the version. `none` means nothing worth releasing. */
export type Bump = "major" | "minor" | "none" | "patch";

const CONVENTIONAL = /^(?<type>[a-z]+)(?:\((?<scope>[^)]*)\))?(?<bang>!)?:\s/;

/** Parse one commit into the fields that decide a version bump. */
export function parseCommit(
  hash: string,
  subject: string,
  body: string
): ReleaseCommit {
  const match = CONVENTIONAL.exec(subject);
  return {
    breaking: match?.groups?.bang === "!" || /^BREAKING[ -]CHANGE:/m.test(body),
    hash,
    subject,
    type: match?.groups?.type ?? "",
  };
}

/**
 * The bump these commits require.
 *
 * `feat` is a minor, `fix` and `perf` are patches, and everything else -
 * `chore`, `docs`, `ci`, `test`, `refactor`, `style`, `build` - is not worth a
 * release on its own.
 */
export function deriveBump(
  commits: readonly ReleaseCommit[],
  currentMajor: number
): Bump {
  if (commits.length === 0) {
    return "none";
  }
  if (commits.some((commit) => commit.breaking)) {
    // Below 1.0 there is no stability contract to break, and the ecosystem
    // treats 0.x minors as the breaking boundary. Jumping to 1.0.0 on the first
    // `feat!` would claim a stability guarantee that does not exist.
    return currentMajor === 0 ? "minor" : "major";
  }
  if (commits.some((commit) => commit.type === "feat")) {
    return "minor";
  }
  if (
    commits.some((commit) => commit.type === "fix" || commit.type === "perf")
  ) {
    return "patch";
  }
  return "none";
}

/** Apply a bump to a semver string. */
export function applyBump(version: string, bump: Bump): string {
  const parts = version.split(".").map(Number);
  if (parts.length !== 3 || parts.some((n) => !Number.isInteger(n) || n < 0)) {
    throw new Error(`"${version}" is not a plain semver version`);
  }
  const [major, minor, patch] = parts as [number, number, number];
  switch (bump) {
    case "major":
      return `${major + 1}.0.0`;
    case "minor":
      return `${major}.${minor + 1}.0`;
    case "patch":
      return `${major}.${minor}.${patch + 1}`;
    default:
      return version;
  }
}

const run = async (command: string, args: readonly string[]) => {
  const { exitCode, stderr, stdout } = await spawnCapture({ args, command });
  if (exitCode !== 0) {
    throw new Error(
      `${command} ${args.join(" ")} failed:\n${stderr.trim() || stdout.trim()}`
    );
  }
  return stdout.trim();
};

const git = (...args: string[]) => run("git", args);

const fail = (message: string): never => {
  process.stderr.write(`release refused: ${message}\n`);
  process.exit(1);
};

/**
 * The executable flow, kept behind `import.meta.main` so importing this
 * module for its version logic does not attempt to cut a release.
 */
async function main() {
  const argv = process.argv.slice(2);
  const execute = argv.includes("--yes");
  const override = argv.find((arg): arg is Bump =>
    ["major", "minor", "patch"].includes(arg)
  );

  // Guards first, and all of them, so a preview reports every problem a real run
  // would hit rather than the first one.
  const branch = await git("rev-parse", "--abbrev-ref", "HEAD");
  if (branch !== "main") {
    fail(`on branch "${branch}"; releases are cut from main`);
  }

  if ((await git("status", "--porcelain")) !== "") {
    fail("the working tree is dirty; commit or stash first");
  }

  await git("fetch", "--quiet", "origin", "main", "--tags");
  if (
    (await git("rev-parse", "HEAD")) !== (await git("rev-parse", "origin/main"))
  ) {
    fail("main and origin/main disagree; push or pull first");
  }

  const manifest = (await import(`../${MANIFEST}`, {
    with: { type: "json" },
  })) as { default: { name: string; version: string } };
  const { name, version: current } = manifest.default;

  const lastTag = await spawnCapture({
    args: ["describe", "--tags", "--abbrev=0", "--match", `${TAG_PREFIX}*`],
    command: "git",
  });
  const previous = lastTag.exitCode === 0 ? lastTag.stdout.trim() : "";
  const range = previous === "" ? "HEAD" : `${previous}..HEAD`;

  const log = await git("log", range, "--format=%H%x1f%s%x1f%b%x1e");
  const commits = log
    .split("\x1e")
    .map((entry) => entry.trim())
    .filter((entry) => entry !== "")
    .map((entry) => {
      const [hash = "", subject = "", body = ""] = entry.split("\x1f");
      return parseCommit(hash, subject, body);
    });

  const derived = deriveBump(commits, Number(current.split(".")[0]));
  const bump = override ?? derived;
  const next = applyBump(current, bump);
  const tag = `${TAG_PREFIX}${next}`;

  process.stdout.write(`package:  ${name}\n`);
  process.stdout.write(
    `current:  ${current}${previous === "" ? "" : ` (${previous})`}\n`
  );
  process.stdout.write(
    `commits:  ${commits.length} since ${previous === "" ? "the first commit" : previous}\n`
  );
  for (const commit of commits) {
    const flag = commit.breaking ? " [breaking]" : "";
    process.stdout.write(
      `  ${commit.hash.slice(0, 7)} ${commit.subject}${flag}\n`
    );
  }
  process.stdout.write(
    `bump:     ${bump}${override === undefined ? " (derived)" : ` (override; derived ${derived})`}\n`
  );
  process.stdout.write(`next:     ${next}\ntag:      ${tag}\n\n`);

  if (bump === "none") {
    fail(
      "nothing here warrants a release - no feat, fix, or perf commits since the last tag. Pass an explicit level to override."
    );
  }

  if ((await git("tag", "--list", tag)) !== "") {
    fail(`tag ${tag} already exists`);
  }

  const published = await spawnCapture({
    args: ["view", `${name}@${next}`, "version"],
    command: "npm",
  });
  if (published.exitCode === 0) {
    fail(`${name}@${next} is already published`);
  }

  if (!execute) {
    process.stdout.write(
      `preview only. Re-run with --yes to release ${tag}.\n`
    );
    process.exit(0);
  }

  // The workflow re-runs the gate, but a tag that fails it leaves a pushed tag
  // with nothing published, and re-tagging the same version is not possible.
  process.stdout.write("running the gate before tagging\n");
  await run("bun", ["run", "gate"]);

  const source = await Bun.file(MANIFEST).text();
  await Bun.write(
    MANIFEST,
    source.replace(`"version": "${current}"`, `"version": "${next}"`)
  );
  const rewritten = (await import(`../${MANIFEST}`, {
    with: { type: "json" },
  })) as { default: { version: string } };
  if (rewritten.default.version !== next) {
    fail(`could not rewrite the version in ${MANIFEST}`);
  }

  await git("add", MANIFEST);
  await git("commit", "--quiet", "-m", `chore(cli): release ${next}`);

  const notes = commits.map((commit) => `- ${commit.subject}`).join("\n");
  await git("tag", "--annotate", tag, "--message", `${tag}\n\n${notes}`);
  await git("push", "--quiet", "origin", "main");
  await git("push", "--quiet", "origin", tag);

  process.stdout.write(
    `pushed ${tag}. The release workflow publishes ${name}@${next}.\n`
  );
}

if (import.meta.main) {
  await main();
}

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

/**
 * Parse one commit into the fields that decide a version bump.
 *
 * A `BREAKING CHANGE:` footer is honoured even though commitlint enforces
 * `footer-empty` here, so new commits cannot carry one: history predating that
 * rule, a merge or revert commit, and anything committed with `--no-verify` can
 * still contain a footer, and silently under-releasing a breaking change is
 * worse than accepting a form the hook would have rejected.
 */
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

  // Read and parse from disk rather than `import`: this file gets rewritten
  // below, and Bun caches a module per specifier, so a second import of the
  // same path returns the pre-write value. Verifying the rewrite that way
  // always reported failure, after the manifest had already been changed.
  const readManifest = async () =>
    JSON.parse(await Bun.file(MANIFEST).text()) as {
      name: string;
      version: string;
    };

  const { name, version: current } = await readManifest();

  if (!/^\d+\.\d+\.\d+$/.test(current)) {
    fail(
      `${MANIFEST} holds "${current}", which is not a plain three-part version. The tag and the bump are both derived from it, so releasing would produce a tag that does not match the package.`
    );
  }

  const lastTag = await spawnCapture({
    args: ["describe", "--tags", "--abbrev=0", "--match", `${TAG_PREFIX}*`],
    command: "git",
  });
  const previous = lastTag.exitCode === 0 ? lastTag.stdout.trim() : "";
  const range = previous === "" ? "HEAD" : `${previous}..HEAD`;

  // In a settled repository the manifest version and the newest release tag
  // agree. When they do not, a previous release stopped half-way - typically the
  // commit landed and the tag never reached the remote. Deriving a new version
  // from here would compute the bump from the *already bumped* manifest and
  // silently skip the version that was never tagged, leaving an orphan release
  // commit behind. Refuse, and say how to finish what was started.
  if (previous !== "" && previous !== `${TAG_PREFIX}${current}`) {
    const expected = `${TAG_PREFIX}${current}`;
    fail(
      `${MANIFEST} says ${current} but the newest tag is ${previous}. A release was left unfinished.\n` +
        `  To complete it:  git tag -a ${expected} -m ${expected} && git push origin ${expected}\n` +
        `  To abandon it:   reset the version in ${MANIFEST} back to ${previous.slice(TAG_PREFIX.length)}`
    );
  }

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

  // Bump first, then gate: the tree that gets tagged is the tree that was
  // verified. Gating before the bump validates a commit that is not the one
  // shipped. On failure the manifest is put back, so a refused release leaves
  // the working tree exactly as it was found.
  const original = await Bun.file(MANIFEST).text();
  const bumped = original.replace(
    `"version": "${current}"`,
    `"version": "${next}"`
  );
  if (bumped === original) {
    fail(`could not find "version": "${current}" to rewrite in ${MANIFEST}`);
  }
  await Bun.write(MANIFEST, bumped);

  const restore = async () => {
    await Bun.write(MANIFEST, original);
  };

  if ((await readManifest()).version !== next) {
    await restore();
    fail(`rewriting ${MANIFEST} did not produce ${next}`);
  }

  process.stdout.write(`bumped ${MANIFEST} to ${next}; running the gate\n`);
  try {
    await run("bun", ["run", "gate"]);
  } catch (error) {
    await restore();
    process.stderr.write(`${(error as Error).message}\n`);
    fail("the gate failed; nothing was committed and the manifest is restored");
  }

  try {
    await git("add", MANIFEST);
    await git("commit", "--quiet", "-m", `chore(cli): release ${next}`);
  } catch (error) {
    await restore();
    process.stderr.write(`${(error as Error).message}\n`);
    fail(
      "the release commit failed; the manifest is restored and nothing was tagged"
    );
  }

  const notes = commits.map((commit) => `- ${commit.subject}`).join("\n");
  try {
    await git("tag", "--annotate", tag, "--message", `${tag}\n\n${notes}`);
  } catch (error) {
    process.stderr.write(`${(error as Error).message}\n`);
    fail(
      `the release commit for ${next} exists but tagging failed, so nothing will publish. Run: git tag -a ${tag} -m ${tag} && git push origin main && git push origin ${tag}`
    );
  }

  // Past this point the failure modes are recoverable but not automatically, so
  // say exactly what state the repository is in rather than dying on a stack
  // trace. The tag is pushed last: it is what triggers the publish, so it must
  // never reach the remote ahead of the commit it names.
  try {
    await git("push", "--quiet", "origin", "main");
  } catch (error) {
    process.stderr.write(`${(error as Error).message}\n`);
    fail(
      `the release commit and ${tag} exist locally but main did not push. Resolve the push, then: git push origin main && git push origin ${tag}`
    );
  }

  try {
    await git("push", "--quiet", "origin", tag);
  } catch (error) {
    process.stderr.write(`${(error as Error).message}\n`);
    fail(
      `main is pushed but ${tag} is not, so nothing will publish. Run: git push origin ${tag}`
    );
  }

  process.stdout.write(
    `pushed ${tag}. The release workflow publishes ${name}@${next}.\n`
  );
}

if (import.meta.main) {
  await main();
}

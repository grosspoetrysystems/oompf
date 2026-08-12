/**
 * CLI-side `gh` (GitHub CLI) integration for OOMPF.
 *
 * This module shells out to the `gh` binary to read the authenticated identity
 * and to publish public Gists. It MUST only ever be imported by CLI-side code:
 * it spawns child processes and therefore cannot run inside a Cloudflare
 * Worker. Every invocation passes an explicit argument array to the runner —
 * there is no shell string and no interpolation, so profile names,
 * descriptions, and file contents can never be reinterpreted as shell syntax.
 *
 * All process spawning is funnelled through an injectable {@link CommandRunner}
 * seam so tests can exercise identity resolution and Gist publishing
 * hermetically, without a real `gh` binary and without creating real Gists.
 */

import { spawnCapture } from "@oompf/core";

import { parseGistLocation } from "./gists.ts";

/** Outcome of running a single command. */
export interface CommandResult {
  /** Process exit code; `null` when the process was terminated by a signal. */
  readonly exitCode: number | null;
  readonly stderr: string;
  readonly stdout: string;
}

/** A single command invocation: an executable plus a literal argument array. */
export interface CommandInput {
  /** Arguments passed verbatim; never concatenated into a shell command. */
  readonly args: readonly string[];
  /** Executable to run (e.g. `"gh"`). Never a shell string. */
  readonly command: string;
  /** Optional UTF-8 text piped to the process stdin. */
  readonly stdin?: string;
}

/**
 * Injectable command seam. Implementations MUST NOT invoke a shell; they run
 * `input.command` with `input.args` as discrete argv entries.
 *
 * A missing executable MUST reject (e.g. an `ENOENT` error) rather than
 * resolve with a non-zero exit code, so callers can distinguish "not
 * installed" from "ran and failed".
 */
export type CommandRunner = (input: CommandInput) => Promise<CommandResult>;

/** Options shared by every `gh` helper. */
export interface GhOptions {
  /** Executable used to invoke the GitHub CLI. Defaults to `"gh"` on `PATH`. */
  readonly ghCommand?: string;
  /** Command seam override; defaults to a `node:child_process` runner. */
  readonly runner?: CommandRunner;
}

const DEFAULT_GH_COMMAND = "gh";

/**
 * The default {@link CommandRunner}: `@oompf/core`'s `spawnCapture`.
 *
 * A thin adapter, not a second implementation — the workspace has exactly one
 * place that spawns processes, so runtime-compatibility decisions live there.
 *
 * Exported so callers can wrap rather than reimplement it (for logging, or a
 * timeout). Every `gh` helper test injects a fake runner, so real spawning
 * behaviour is covered by core's `spawn.test.ts`.
 */
export const nodeCommandRunner: CommandRunner = ({ command, args, stdin }) =>
  spawnCapture({ args, command, stdin });

/** True when a thrown spawn error indicates the executable was not found. */
function isMissingExecutable(error: unknown): boolean {
  if (typeof error === "object" && error !== null) {
    const code = (error as { code?: unknown }).code;
    if (code === "ENOENT") {
      return true;
    }
  }
  const message = error instanceof Error ? error.message : String(error);
  return /ENOENT|not found|no such file/i.test(message);
}

/** The authenticated GitHub identity. */
export interface GithubIdentity {
  readonly login: string;
}

/**
 * Resolve the authenticated GitHub login via `gh api user`.
 *
 * @throws Error with an actionable message when `gh` is not installed, when it
 *   is not authenticated, or when the response cannot be parsed. The message
 *   never echoes tokens: `gh` reads credentials from its own keyring and does
 *   not print them, and this helper only surfaces `gh`'s own diagnostics.
 */
export async function getGithubIdentity(
  options?: GhOptions
): Promise<GithubIdentity> {
  const ghCommand = options?.ghCommand ?? DEFAULT_GH_COMMAND;
  const runner = options?.runner ?? nodeCommandRunner;

  let result: CommandResult;
  try {
    result = await runner({ args: ["api", "user"], command: ghCommand });
  } catch (error) {
    if (isMissingExecutable(error)) {
      throw new Error(
        `GitHub CLI (\`${ghCommand}\`) was not found on your PATH. Install it from https://cli.github.com/ and run \`gh auth login\`.`
      );
    }
    throw error;
  }

  if (result.exitCode !== 0) {
    const detail = result.stderr.trim() || `exit code ${result.exitCode}`;
    throw new Error(
      `GitHub CLI could not read your account. Run \`gh auth login\` to authenticate. Details: ${detail}`
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(result.stdout);
  } catch {
    throw new Error(
      "GitHub CLI returned a response that was not valid JSON for `gh api user`."
    );
  }
  const login =
    typeof parsed === "object" &&
    parsed !== null &&
    "login" in parsed &&
    typeof parsed.login === "string"
      ? parsed.login
      : "";
  if (login.length === 0) {
    throw new Error(
      "GitHub CLI response for `gh api user` did not include a login. Run `gh auth login` to authenticate."
    );
  }
  return { login };
}

/** Content and metadata for a public profile Gist to publish. */
export interface CreatePublicProfileGistInput {
  /** Exact file contents, piped to `gh` over stdin (no temp file). */
  readonly content: string;
  /** Human-readable Gist description. */
  readonly description: string;
  /** Gist filename, e.g. `<profile-name>.yml`. Passed verbatim to `gh`. */
  readonly filename: string;
}

/** Coordinates of a published Gist. */
export interface CreatedGist {
  /** The Gist's opaque hex identifier. */
  readonly gistId: string;
  /** Browser-facing URL as reported by `gh` (`https://gist.github.com/...`). */
  readonly htmlUrl: string;
  /** Canonical GitHub API URL: `https://api.github.com/gists/<id>`. */
  readonly url: string;
}

/**
 * Publish `input` as a **public** Gist via `gh gist create --public`.
 *
 * The content is streamed to `gh` over stdin and named with `--filename`, so
 * nothing is written to a temp file and no shell interpolation occurs. The
 * `--public` flag is always present: OOMPF never creates secret Gists.
 *
 * @throws Error when `gh` is missing, exits non-zero, or prints output from
 *   which no Gist URL can be parsed. Error details carry `gh`'s stderr, which
 *   does not contain credentials.
 */
export async function createPublicProfileGist(
  input: CreatePublicProfileGistInput,
  options?: GhOptions
): Promise<CreatedGist> {
  const ghCommand = options?.ghCommand ?? DEFAULT_GH_COMMAND;
  const runner = options?.runner ?? nodeCommandRunner;

  const args = [
    "gist",
    "create",
    "--public",
    "--filename",
    input.filename,
    "--desc",
    input.description,
    "-",
  ];

  let result: CommandResult;
  try {
    result = await runner({ args, command: ghCommand, stdin: input.content });
  } catch (error) {
    if (isMissingExecutable(error)) {
      throw new Error(
        `GitHub CLI (\`${ghCommand}\`) was not found on your PATH. Install it from https://cli.github.com/ and run \`gh auth login\`.`
      );
    }
    throw error;
  }

  if (result.exitCode !== 0) {
    const detail = result.stderr.trim() || `exit code ${result.exitCode}`;
    throw new Error(`GitHub CLI failed to create the public Gist: ${detail}`);
  }

  const htmlUrl = extractGistUrl(result.stdout);
  if (htmlUrl === null) {
    throw new Error(
      `GitHub CLI did not report a Gist URL after creation. Output: ${result.stdout.trim() || "(empty)"}`
    );
  }
  const { gistId } = parseGistLocation(htmlUrl);
  return {
    gistId,
    htmlUrl,
    url: `https://api.github.com/gists/${gistId}`,
  };
}

/** Find the first `gist.github.com` URL in `gh`'s stdout, or `null`. */
function extractGistUrl(stdout: string): string | null {
  const match = stdout.match(/https?:\/\/gist\.github\.com\/\S+/);
  if (match === null) {
    return null;
  }
  // Strip trailing punctuation the shell/terminal may have appended.
  return match[0].replace(/[).,]+$/, "");
}

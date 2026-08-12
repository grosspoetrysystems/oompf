/**
 * The workspace's single process-spawning primitive.
 *
 * Backed by `node:child_process` rather than `Bun.spawn`. Bun implements the
 * Node API, so one implementation serves both runtimes — whereas reaching for
 * the `Bun` global makes the published CLI throw
 * `Cannot read properties of undefined (reading 'spawn')` the moment it runs
 * under Node, which is exactly how this module came to exist.
 *
 * Every caller passes an explicit argument array. There is no shell string and
 * no interpolation, so profile names, descriptions, and file contents can never
 * be reinterpreted as shell syntax.
 *
 * Import only from CLI-side code: spawning is unavailable inside a Cloudflare
 * Worker.
 */

import { spawn } from "node:child_process";

/** Outcome of running a single command to completion. */
export interface SpawnResult {
  /** Process exit code; `null` when the process was terminated by a signal. */
  readonly exitCode: number | null;
  readonly stderr: string;
  readonly stdout: string;
}

/** A single command invocation: an executable plus a literal argument array. */
export interface SpawnInput {
  /** Arguments passed verbatim; never concatenated into a shell command. */
  readonly args: readonly string[];
  /** Executable to run (e.g. `"gh"`). Never a shell string. */
  readonly command: string;
  /** Environment for the child; defaults to the parent's when omitted. */
  readonly env?: Record<string, string | undefined>;
  /** Optional UTF-8 text piped to the child's stdin. */
  readonly stdin?: string;
}

/**
 * Run a command, capturing its output.
 *
 * Rejects with the underlying spawn error when the executable is missing (an
 * `ENOENT`), so callers can distinguish "not installed" from "ran and failed"
 * — a non-zero exit code always means the binary ran.
 */
export function spawnCapture(input: SpawnInput): Promise<SpawnResult> {
  const { args, command, env, stdin } = input;
  const { promise, resolve, reject } = Promise.withResolvers<SpawnResult>();

  const child = spawn(command, [...args], {
    stdio: [stdin === undefined ? "ignore" : "pipe", "pipe", "pipe"],
    ...(env === undefined ? {} : { env }),
  });

  // `stdio` requests pipes for both, but the typings stay nullable; treat an
  // absent stream as a failure rather than silently reporting no output.
  const { stderr: errStream, stdout: outStream } = child;
  if (outStream === null || errStream === null) {
    reject(new Error(`Could not capture output from "${command}".`));
    return promise;
  }

  let stdout = "";
  let stderr = "";
  outStream.setEncoding("utf8");
  errStream.setEncoding("utf8");
  outStream.on("data", (chunk: string) => {
    stdout += chunk;
  });
  errStream.on("data", (chunk: string) => {
    stderr += chunk;
  });

  // A spawn failure (missing binary) surfaces here, never as an exit code.
  child.on("error", reject);
  child.on("close", (exitCode) => {
    resolve({ exitCode, stderr, stdout });
  });

  if (stdin !== undefined && child.stdin !== null) {
    // EPIPE if the child exits before reading stdin; the close handler still
    // resolves with whatever was written, so the write error is not fatal.
    child.stdin.on("error", () => undefined);
    child.stdin.end(stdin, "utf8");
  }

  return promise;
}

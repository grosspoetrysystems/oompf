/**
 * Injectable seams shared by every OOMPF CLI command.
 *
 * The commands never touch the network, filesystem, `gh`, or `omp` directly:
 * they go through the seams declared here. Production wires the real Bun/Node
 * implementations via {@link resolveDeps}; focused tests pass fakes so no real
 * profile, Gist, or HTTP endpoint is ever touched.
 */

import { access, mkdir, readFile, writeFile } from "node:fs/promises";

import {
  discoverProfiles,
  resolveInstallTarget,
  resolveProfileConfig,
} from "@oompf/core";
import type { CommandRunner, GistFetch } from "@oompf/github";

/** Default OOMPF web endpoint; overridable through `OOMPF_BASE_URL`. */
export const DEFAULT_BASE_URL = "https://oompf.ai";

/** Minimal structural view of an HTTP response the API client consumes. */
export interface HttpResponse {
  readonly ok: boolean;
  readonly status: number;
  text(): Promise<string>;
}

/** Injectable HTTP seam for the OOMPF web API (register/search/metadata). */
export type HttpFetch = (
  url: string,
  init?: {
    readonly method?: string;
    readonly headers?: Record<string, string>;
    readonly body?: string;
  }
) => Promise<HttpResponse>;

/** Injectable filesystem seam for reading and atomically installing configs. */
export interface FsSeam {
  /** True when a path exists (file or directory). */
  exists(path: string): Promise<boolean>;
  /** Recursively create a directory with the given octal permission mode. */
  mkdir(path: string, mode: number): Promise<void>;
  /** Read a UTF-8 text file. */
  readFile(path: string): Promise<string>;
  /** Write a UTF-8 text file with the given octal permission mode. */
  writeFile(path: string, data: string, mode: number): Promise<void>;
}

/**
 * A CLI failure with a stable machine code. The command wrappers translate it
 * into an Incur `c.error` so the process exits non-zero with a value-free
 * message and no credential leakage.
 */
export class CommandError extends Error {
  constructor(
    readonly code: string,
    message: string
  ) {
    super(message);
    this.name = "CommandError";
  }
}

/** The `c.error` control-flow helper a command handler exposes. */
export type CliErrorFn = (options: { code: string; message: string }) => never;

/**
 * Translate a thrown value into an Incur `c.error`. A {@link CommandError}
 * carries its stable code; any other error surfaces its (already value-free)
 * message under a generic code. Never rethrows raw values, so exits stay
 * deterministic.
 */
export function toCliError(error: CliErrorFn, err: unknown): never {
  if (err instanceof CommandError) {
    return error({ code: err.code, message: err.message });
  }
  const message = err instanceof Error ? err.message : String(err);
  return error({ code: "error", message });
}

/** Every seam a command may need, each optional and defaulted at the boundary. */
export interface CliDeps {
  /** Profile discovery seam (publish default-profile derivation). */
  readonly discoverProfiles?: typeof discoverProfiles;
  /** Filesystem seam. */
  readonly fs?: FsSeam;
  /** `gh` executable name; defaults to `"gh"`. */
  readonly ghCommand?: string;
  /** Gist raw-fetch seam; defaults to the global `fetch`. */
  readonly gistFetch?: GistFetch;
  /** OOMPF web API HTTP seam; defaults to the global `fetch`. */
  readonly httpFetch?: HttpFetch;
  /** `omp` executable name; defaults to `"omp"`. */
  readonly ompCommand?: string;
  /** Install-target resolver seam (add). */
  readonly resolveInstallTarget?: typeof resolveInstallTarget;
  /** Existing-profile resolver seam (publish). */
  readonly resolveProfileConfig?: typeof resolveProfileConfig;
  /** `gh` command runner seam (auth check + Gist creation). */
  readonly runner?: CommandRunner;
}

/** The global `fetch`, if the runtime provides one. */
const globalFetch = (globalThis as { fetch?: HttpFetch }).fetch;

/** Default HTTP seam backed by the global `fetch`. */
const defaultHttpFetch: HttpFetch = (url, init) => {
  if (globalFetch === undefined) {
    throw new CommandError(
      "network_error",
      "No fetch implementation is available in this runtime."
    );
  }
  return globalFetch(url, init);
};

/** Default filesystem seam backed by `node:fs/promises`. */
export const defaultFs: FsSeam = {
  exists: async (path) => {
    try {
      await access(path);
      return true;
    } catch {
      return false;
    }
  },
  mkdir: async (path, mode) => {
    await mkdir(path, { mode, recursive: true });
  },
  readFile: (path) => readFile(path, "utf8"),
  writeFile: (path, data, mode) => writeFile(path, data, { mode }),
};

/** Resolve a fully-defaulted seam bundle from partial {@link CliDeps}. */
export function resolveDeps(deps: CliDeps = {}) {
  return {
    discoverProfiles: deps.discoverProfiles ?? discoverProfiles,
    fs: deps.fs ?? defaultFs,
    ghCommand: deps.ghCommand,
    gistFetch: deps.gistFetch,
    httpFetch: deps.httpFetch ?? defaultHttpFetch,
    ompCommand: deps.ompCommand,
    resolveInstallTarget: deps.resolveInstallTarget ?? resolveInstallTarget,
    resolveProfileConfig: deps.resolveProfileConfig ?? resolveProfileConfig,
    runner: deps.runner,
  } as const;
}

/** The fully-resolved seam bundle a command handler operates against. */
export type ResolvedDeps = ReturnType<typeof resolveDeps>;

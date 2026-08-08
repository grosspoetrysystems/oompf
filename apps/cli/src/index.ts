#!/usr/bin/env bun
/**
 * OOMPF CLI entrypoint (binary name: `oompf`).
 *
 * Builds the Incur router CLI, wiring the four commands (`publish`, `add`,
 * `inspect`, `search`) against injectable seams. {@link createCli} takes an
 * optional {@link CliDeps} bundle so focused tests can drive every command with
 * fake `gh`/Gist/HTTP/`omp`/filesystem implementations; production omits it and
 * gets the real Bun/Node-backed seams.
 */

import { Cli } from "incur";

import { registerAdd } from "./commands/add.ts";
import { registerInspect } from "./commands/inspect.ts";
import { registerPublish } from "./commands/publish.ts";
import { registerSearch } from "./commands/search.ts";
import { resolveDeps, type CliDeps } from "./deps.ts";

/** OOMPF CLI version, surfaced by `oompf --version`. */
export const CLI_VERSION = "0.0.0";

/** Build the OOMPF CLI with the given (optional) injectable seams. */
export function createCli(deps: CliDeps = {}) {
  const resolved = resolveDeps(deps);
  const cli = Cli.create("oompf", {
    description: "Share and install OMP profiles",
    version: CLI_VERSION,
    // No auto-update network calls; the CLI is agent-oriented and deterministic.
    update: false,
  });
  registerPublish(cli, resolved);
  registerAdd(cli, resolved);
  registerInspect(cli, resolved);
  registerSearch(cli, resolved);
  return cli;
}

// Only parse argv and run when executed directly (not when imported by tests).
if (import.meta.main) {
  await createCli().serve();
}

/**
 * `oompf add <ref> [--name <name>]` — install a shared profile as a native OMP
 * profile.
 *
 * The reference may be an OOMPF URL/id, a public Gist URL, or a bare Gist id.
 * The canonical YAML is fetched and validated before anything is written. The
 * local name defaults to `<github-owner>-<profile-name>` (overridable with
 * `--name`) and is checked against OMP's own naming rules. The install target
 * directory is resolved by asking OMP itself (`omp --profile <name> config
 * path`), never by hardcoding a home path. An existing config is refused
 * outright — there is no overwrite and no `--force`.
 */

import { join } from "node:path";
import { validateArtifact, validateProfileName } from "@oompf/core";
import { fetchPublicGist } from "@oompf/github";
import { type Cli, z } from "incur";

import { fetchProfileMetadata, parseOompfRef } from "../api.ts";
import { CommandError, type ResolvedDeps, toCliError } from "../deps.ts";
import { addOutput, cliEnv } from "../output.ts";

/** OMP config filenames that would collide with an install. */
const CONFIG_FILENAMES = ["config.yml", "config.yaml"] as const;

/** Strip a recognised YAML extension from a Gist filename to get the stem. */
function filenameStem(filename: string): string {
  return filename.replace(/\.(ya?ml)$/i, "");
}

/** Register the `add` command on the given CLI. */
export function registerAdd(cli: Cli.Cli, deps: ResolvedDeps): void {
  cli.command("add", {
    args: z.object({
      ref: z.string().describe("OOMPF URL/id, public Gist URL, or Gist id"),
    }),
    description: "Install a shared profile as a native OMP profile",
    env: cliEnv,
    examples: [
      {
        args: { ref: "https://gist.github.com/octocat/abc123" },
        description: "Install a profile from a public Gist",
      },
      {
        args: { ref: "https://oompf.run/p/prof_0123" },
        description: "Install under an explicit local name",
        options: { name: "work" },
      },
    ],
    options: z.object({
      agent: z
        .enum(["omp", "pi"])
        .optional()
        .describe("Agent runtime to use (default: omp)"),
      name: z
        .string()
        .optional()
        .describe("Local profile name (defaults to <owner>-<profile>)"),
    }),
    output: addOutput,
    async run(c) {
      try {
        // Resolve the agent runtime once: an explicitly pinned binary wins;
        // otherwise probe the installed runtimes.
        const ompCommand =
          deps.ompCommand ??
          (
            await deps.resolveAgentRuntime({
              requested: c.options.agent,
            })
          ).command;

        // 1. Resolve the canonical Gist source (directly or via an OOMPF id).
        const oompfId = parseOompfRef(c.args.ref);
        let sourceUrl = c.args.ref;
        let fetchUrl = sourceUrl;
        let expectedHash: string | null = null;
        if (oompfId !== null) {
          const record = await fetchProfileMetadata(
            c.env.OOMPF_BASE_URL,
            oompfId,
            deps.httpFetch
          );
          if (record.revision === null) {
            throw new CommandError(
              "unverifiable_artifact",
              "The indexed profile has no pinned revision and cannot be installed reproducibly."
            );
          }
          sourceUrl = record.sourceUrl;
          fetchUrl = `https://api.github.com/gists/${record.gistId}/${record.revision}`;
          expectedHash = record.contentHash;
        }
        const gist = await fetchPublicGist(fetchUrl, {
          fetch: deps.gistFetch,
        });
        if (expectedHash !== null && gist.contentHash !== expectedHash) {
          throw new CommandError(
            "fingerprint_mismatch",
            "The pinned profile bytes do not match the indexed fingerprint. Refusing to install."
          );
        }

        // 2. Validate before writing anything to disk.
        const validation = validateArtifact({ yaml: gist.content });
        if (validation.structural === "invalid" || validation.facts === null) {
          throw new CommandError(
            "invalid_artifact",
            `Refusing to install an invalid artifact: ${validation.errors.join("; ")}`
          );
        }
        if (validation.blocking.length > 0) {
          const where = validation.blocking.map((f) => f.path).join(", ");
          throw new CommandError(
            "blocking_secrets",
            `Refusing to install: high-confidence secrets detected at ${where}. Remove them and retry.`
          );
        }

        // 3. Derive and validate the local profile name.
        const stem = filenameStem(gist.filename);
        const candidate =
          c.options.name ??
          (gist.owner === null ? stem : `${gist.owner.toLowerCase()}-${stem}`);
        const nameCheck = validateProfileName(candidate);
        if (!nameCheck.ok) {
          throw new CommandError(
            "invalid_name",
            `Profile name "${candidate}" is invalid: ${nameCheck.reason} Pass --name <name>.`
          );
        }
        const name = nameCheck.value;

        // 4. Ask OMP for the install directory (portable, never hardcoded).
        const agentDir = await deps.resolveInstallTarget(name, {
          ompCommand,
        });

        // 5. Refuse an existing target without modifying anything.
        for (const filename of CONFIG_FILENAMES) {
          const existing = join(agentDir, filename);
          if (await deps.fs.exists(existing)) {
            throw new CommandError(
              "target_exists",
              `Profile "${name}" already has a config at ${existing}. Refusing to overwrite.`
            );
          }
        }

        // 6. Write the native config with restrictive permissions.
        await deps.fs.mkdir(agentDir, 0o700);
        const target = join(agentDir, "config.yml");
        await deps.fs.writeFile(target, gist.content, 0o600);

        const command = `omp --profile ${name}`;
        const prerequisites = validation.facts.prerequisites;
        return c.ok(
          {
            command,
            hash: gist.contentHash,
            name,
            path: target,
            revision: gist.revision,
            source: sourceUrl,
            warnings: [...validation.warnings],
            // Value-free names/kinds; omitted entirely when none to keep the
            // output quiet.
            ...(prerequisites.length > 0
              ? { prerequisites: [...prerequisites] }
              : {}),
          },
          { cta: { commands: [command], description: "Run it with:" } }
        );
      } catch (error) {
        return toCliError(c.error, error);
      }
    },
  });
}

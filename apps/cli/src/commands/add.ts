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

import { z, type Cli } from "incur";

import { validateArtifact, validateProfileName } from "@oompf/core";
import { fetchPublicGist } from "@oompf/github";

import { fetchProfileMetadata, parseOompfRef } from "../api.ts";
import { CommandError, toCliError, type ResolvedDeps } from "../deps.ts";
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
    description: "Install a shared profile as a native OMP profile",
    args: z.object({
      ref: z.string().describe("OOMPF URL/id, public Gist URL, or Gist id"),
    }),
    options: z.object({
      name: z
        .string()
        .optional()
        .describe("Local profile name (defaults to <owner>-<profile>)"),
    }),
    env: cliEnv,
    output: addOutput,
    examples: [
      {
        args: { ref: "https://gist.github.com/octocat/abc123" },
        description: "Install a profile from a public Gist",
      },
      {
        args: { ref: "https://oompf.ai/p/prof_0123" },
        options: { name: "work" },
        description: "Install under an explicit local name",
      },
    ],
    async run(c) {
      try {
        // 1. Resolve the canonical Gist source (directly or via an OOMPF id).
        const oompfId = parseOompfRef(c.args.ref);
        let sourceUrl = c.args.ref;
        if (oompfId !== null) {
          const record = await fetchProfileMetadata(
            c.env.OOMPF_BASE_URL,
            oompfId,
            deps.httpFetch,
          );
          sourceUrl = record.sourceUrl;
        }
        const gist = await fetchPublicGist(sourceUrl, { fetch: deps.gistFetch });

        // 2. Validate before writing anything to disk.
        const validation = validateArtifact({ yaml: gist.content });
        if (validation.structural === "invalid") {
          throw new CommandError(
            "invalid_artifact",
            `Refusing to install an invalid artifact: ${validation.errors.join("; ")}`,
          );
        }

        // 3. Derive and validate the local profile name.
        const stem = filenameStem(gist.filename);
        const candidate =
          c.options.name ??
          (gist.owner !== null ? `${gist.owner.toLowerCase()}-${stem}` : stem);
        const nameCheck = validateProfileName(candidate);
        if (!nameCheck.ok) {
          throw new CommandError(
            "invalid_name",
            `Profile name "${candidate}" is invalid: ${nameCheck.reason} Pass --name <name>.`,
          );
        }
        const name = nameCheck.value;

        // 4. Ask OMP for the install directory (portable, never hardcoded).
        const agentDir = await deps.resolveInstallTarget(name, {
          ompCommand: deps.ompCommand,
        });

        // 5. Refuse an existing target without modifying anything.
        for (const filename of CONFIG_FILENAMES) {
          const existing = join(agentDir, filename);
          if (await deps.fs.exists(existing)) {
            throw new CommandError(
              "target_exists",
              `Profile "${name}" already has a config at ${existing}. Refusing to overwrite.`,
            );
          }
        }

        // 6. Write the native config with restrictive permissions.
        await deps.fs.mkdir(agentDir, 0o700);
        const target = join(agentDir, "config.yml");
        await deps.fs.writeFile(target, gist.content, 0o600);

        const command = `omp --profile ${name}`;
        return c.ok(
          {
            name,
            path: target,
            source: sourceUrl,
            revision: gist.revision,
            hash: gist.contentHash,
            command,
            warnings: [...validation.warnings],
          },
          { cta: { description: "Run it with:", commands: [command] } },
        );
      } catch (error) {
        return toCliError(c.error, error);
      }
    },
  });
}

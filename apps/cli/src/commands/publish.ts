/**
 * `oompf publish [profile]` — share a local OMP profile as a public Gist and
 * register it with the OOMPF index.
 *
 * The command resolves a named profile through `@oompf/core`, validates and
 * scans its canonical `config.yml`, verifies `gh` authentication, creates a
 * public one-file Gist through `@oompf/github`, registers the Gist with the web
 * API, and prints the GitHub URL, OOMPF URL, hash, and a copyable add command.
 * It never publishes credentials, project overlays, or unrelated files: only
 * the single selected config artifact is sent, and high-confidence secrets
 * abort the publish before anything leaves the machine.
 */

import { z, type Cli } from "incur";

import { validateArtifact } from "@oompf/core";
import { createPublicProfileGist, getGithubIdentity } from "@oompf/github";

import { registerProfile } from "../api.ts";
import { CommandError, toCliError, type ResolvedDeps } from "../deps.ts";
import { cliEnv, publishOutput } from "../output.ts";

/** Concatenate the base URL and a site-relative path from the register call. */
function toOompfUrl(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/+$/, "")}${path.startsWith("/") ? path : `/${path}`}`;
}

/** Read the publisher's OMP setup version from extracted facts, when present. */
function ompVersionFromFacts(fields: Readonly<Record<string, unknown>>): string | undefined {
  const value = fields.setupVersion;
  if (typeof value === "string" && value.trim() !== "") return value.trim();
  if (typeof value === "number") return String(value);
  return undefined;
}

/** Register the `publish` command on the given CLI. */
export function registerPublish(
  cli: Cli.Cli,
  deps: ResolvedDeps,
): void {
  cli.command("publish", {
    description: "Publish a local OMP profile as a public Gist and index it",
    args: z.object({
      profile: z
        .string()
        .optional()
        .describe("Local OMP profile name; omitted picks the sole profile"),
    }),
    env: cliEnv,
    output: publishOutput,
    examples: [
      { args: { profile: "work" }, description: "Publish the 'work' profile" },
    ],
    async run(c) {
      try {
        const ompOptions = { ompCommand: deps.ompCommand };

        // 1. Resolve the named profile (or derive it when unambiguous).
        let name: string;
        let configPath: string | null;
        if (c.args.profile !== undefined) {
          const resolved = await deps.resolveProfileConfig(
            c.args.profile,
            ompOptions,
          );
          name = resolved.profile;
          configPath = resolved.configPath;
        } else {
          const discovered = await deps.discoverProfiles(ompOptions);
          if (discovered.length === 0) {
            throw new CommandError(
              "no_profile",
              "No OMP profiles found. Pass a profile name: oompf publish <profile>.",
            );
          }
          if (discovered.length > 1) {
            const names = discovered.map((p) => p.name).join(", ");
            throw new CommandError(
              "ambiguous_profile",
              `Multiple profiles found (${names}). Specify one: oompf publish <profile>.`,
            );
          }
          const only = discovered[0]!;
          name = only.name;
          configPath = only.configPath;
        }

        if (configPath === null) {
          throw new CommandError(
            "missing_config",
            `Profile "${name}" has no config.yml/config.yaml to publish.`,
          );
        }

        // 2. Read, validate, and secret-scan the canonical artifact.
        const yaml = await deps.fs.readFile(configPath);
        const validation = validateArtifact({ yaml });
        if (validation.structural === "invalid") {
          throw new CommandError(
            "invalid_artifact",
            `Profile "${name}" is not a valid artifact: ${validation.errors.join("; ")}`,
          );
        }
        if (validation.blocking.length > 0) {
          const where = validation.blocking.map((f) => f.path).join(", ");
          throw new CommandError(
            "blocking_secrets",
            `Refusing to publish: high-confidence secrets detected at ${where}. Remove them and retry.`,
          );
        }

        // 3. Verify GitHub authentication before creating anything.
        await getGithubIdentity({ runner: deps.runner, ghCommand: deps.ghCommand });

        // 4. Create the public one-file Gist.
        const gist = await createPublicProfileGist(
          {
            filename: `${name}.yml`,
            content: yaml,
            description: `OMP profile "${name}" shared via OOMPF`,
          },
          { runner: deps.runner, ghCommand: deps.ghCommand },
        );

        // 5. Register the source with the OOMPF web API.
        const ompVersion = ompVersionFromFacts(validation.facts?.fields ?? {});
        const registration = await registerProfile(
          c.env.OOMPF_BASE_URL,
          { source: gist.htmlUrl, ompVersion },
          deps.httpFetch,
        );

        const oompfUrl = toOompfUrl(c.env.OOMPF_BASE_URL, registration.url);
        const addCommand = `oompf add ${oompfUrl}`;
        return c.ok(
          {
            profile: name,
            githubUrl: gist.htmlUrl,
            oompfUrl,
            gistId: gist.gistId,
            revision: null,
            hash: validation.hash,
            structural: registration.validation.structural,
            warnings: [
              ...validation.warnings,
              ...registration.validation.warnings,
            ],
            addCommand,
          },
          { cta: { description: "Install it with:", commands: [addCommand] } },
        );
      } catch (error) {
        return toCliError(c.error, error);
      }
    },
  });
}

/**
 * `oompf inspect <ref>` — show a shared profile's metadata without installing.
 *
 * The reference may be an OOMPF URL/id or a public Gist URL/id. An OOMPF ref is
 * answered from the index metadata; a Gist ref is fetched and validated live.
 * Only displayable metadata — source, revision/hash, structural verdict, facts,
 * and the install command — is printed. The canonical artifact content is never
 * emitted.
 */

import { z, type Cli } from "incur";

import { validateArtifact } from "@oompf/core";
import { fetchPublicGist } from "@oompf/github";

import { fetchProfileMetadata, parseOompfRef } from "../api.ts";
import { toCliError, type ResolvedDeps } from "../deps.ts";
import { cliEnv, inspectOutput } from "../output.ts";

/** Strip a recognised YAML extension from a Gist filename to get the stem. */
function filenameStem(filename: string): string {
  return filename.replace(/\.(ya?ml)$/i, "");
}

/** Read the OMP setup version from extracted facts, when present. */
function ompVersionFromFacts(
  fields: Readonly<Record<string, unknown>> | undefined,
): string | null {
  const value = fields?.setupVersion;
  if (typeof value === "string" && value.trim() !== "") return value.trim();
  if (typeof value === "number") return String(value);
  return null;
}

/** Register the `inspect` command on the given CLI. */
export function registerInspect(cli: Cli.Cli, deps: ResolvedDeps): void {
  cli.command("inspect", {
    description: "Show a shared profile's metadata without installing it",
    args: z.object({
      ref: z.string().describe("OOMPF URL/id, public Gist URL, or Gist id"),
    }),
    env: cliEnv,
    output: inspectOutput,
    examples: [
      {
        args: { ref: "https://gist.github.com/octocat/abc123" },
        description: "Inspect a public Gist profile",
      },
    ],
    async run(c) {
      try {
        const oompfId = parseOompfRef(c.args.ref);
        if (oompfId !== null) {
          const record = await fetchProfileMetadata(
            c.env.OOMPF_BASE_URL,
            oompfId,
            deps.httpFetch,
          );
          return c.ok(
            {
              source: record.sourceUrl,
              sourceType: "oompf",
              name: record.profileName,
              owner: record.owner,
              revision: record.revision,
              hash: record.contentHash,
              structural: record.validation.structural,
              errors: [...record.validation.errors],
              warnings: [...record.validation.warnings],
              models: [...record.facts.models],
              providers: [...record.facts.providers],
              ompVersion: record.ompVersion,
              installCommand: `oompf add ${c.args.ref}`,
            },
            {
              cta: {
                description: "Install it with:",
                commands: [`oompf add ${c.args.ref}`],
              },
            },
          );
        }

        const gist = await fetchPublicGist(c.args.ref, { fetch: deps.gistFetch });
        const validation = validateArtifact({ yaml: gist.content });
        const facts = validation.facts;
        return c.ok(
          {
            source: gist.htmlUrl,
            sourceType: "gist",
            name: filenameStem(gist.filename),
            owner: gist.owner,
            revision: gist.revision,
            hash: gist.contentHash,
            structural: validation.structural,
            errors: [...validation.errors],
            warnings: [...validation.warnings],
            models: facts ? [...facts.models] : [],
            providers: facts ? [...facts.providers] : [],
            ompVersion: ompVersionFromFacts(facts?.fields),
            installCommand: `oompf add ${c.args.ref}`,
          },
          {
            cta: {
              description: "Install it with:",
              commands: [`oompf add ${c.args.ref}`],
            },
          },
        );
      } catch (error) {
        return toCliError(c.error, error);
      }
    },
  });
}

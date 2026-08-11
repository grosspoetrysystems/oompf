/**
 * `oompf inspect <ref>` — show a shared profile's metadata without installing.
 *
 * The reference may be an OOMPF URL/id or a public Gist URL/id. An OOMPF ref is
 * answered from the index metadata; a Gist ref is fetched and validated live.
 * Only displayable metadata — source, revision/hash, structural verdict, facts,
 * and the install command — is printed. The canonical artifact content is never
 * emitted.
 */

import { validateArtifact } from "@oompf/core";
import { fetchPublicGist } from "@oompf/github";
import { type Cli, z } from "incur";

import { fetchProfileMetadata, parseOompfRef } from "../api.ts";
import { type ResolvedDeps, toCliError } from "../deps.ts";
import { cliEnv, inspectOutput } from "../output.ts";

/** Strip a recognised YAML extension from a Gist filename to get the stem. */
function filenameStem(filename: string): string {
  return filename.replace(/\.(ya?ml)$/i, "");
}

/** Register the `inspect` command on the given CLI. */
export function registerInspect(cli: Cli.Cli, deps: ResolvedDeps): void {
  cli.command("inspect", {
    args: z.object({
      ref: z.string().describe("OOMPF URL/id, public Gist URL, or Gist id"),
    }),
    description: "Show a shared profile's metadata without installing it",
    env: cliEnv,
    examples: [
      {
        args: { ref: "https://gist.github.com/octocat/abc123" },
        description: "Inspect a public Gist profile",
      },
    ],
    output: inspectOutput,
    async run(c) {
      try {
        const oompfId = parseOompfRef(c.args.ref);
        if (oompfId !== null) {
          const record = await fetchProfileMetadata(
            c.env.OOMPF_BASE_URL,
            oompfId,
            deps.httpFetch
          );
          return c.ok(
            {
              aliases: [...record.facts.aliases],
              errors: [...record.validation.errors],
              hash: record.contentHash,
              installCommand: `oompf add ${c.args.ref}`,
              metadata: {
                ...record.metadata,
                links: [...record.metadata.links],
                tags: [...record.metadata.tags],
              },
              models: [...record.facts.models],
              name: record.profileName,
              ompVersion: record.ompVersion,
              owner: record.owner,
              providers: [...record.facts.providers],
              revision: record.revision,
              source: record.sourceUrl,
              sourceType: "oompf",
              structural: record.validation.structural,
              warnings: [...record.validation.warnings],
            },
            {
              cta: {
                commands: [`oompf add ${c.args.ref}`],
                description: "Install it with:",
              },
            }
          );
        }

        const gist = await fetchPublicGist(c.args.ref, {
          fetch: deps.gistFetch,
        });
        const validation = validateArtifact({ yaml: gist.content });
        const facts = validation.facts;
        return c.ok(
          {
            aliases: facts ? [...facts.aliases] : [],
            errors: [...validation.errors],
            hash: gist.contentHash,
            installCommand: `oompf add ${c.args.ref}`,
            metadata: {
              ...validation.metadata,
              links: [...validation.metadata.links],
              tags: [...validation.metadata.tags],
            },
            models: facts ? [...facts.models] : [],
            name: filenameStem(gist.filename),
            ompVersion: null,
            owner: gist.owner,
            providers: facts ? [...facts.providers] : [],
            revision: gist.revision,
            source: gist.htmlUrl,
            sourceType: "gist",
            structural: validation.structural,
            warnings: [...validation.warnings],
          },
          {
            cta: {
              commands: [`oompf add ${c.args.ref}`],
              description: "Install it with:",
            },
          }
        );
      } catch (error) {
        return toCliError(c.error, error);
      }
    },
  });
}

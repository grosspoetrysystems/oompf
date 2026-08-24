/**
 * `oompf upgrade <ref>` — review and optionally apply model-only successors.
 *
 * The command plans from the current owned Gist head, not the indexed pinned
 * revision. It patches that same Gist only after confirmation, then registers
 * the unchanged source URL so the stable OOMPF profile identity survives.
 */

import { confirm, isCancel } from "@clack/prompts";
import { MODEL_CATALOG, proposeUpgrade, validateArtifact } from "@oompf/core";
import {
  fetchPublicGist,
  getGithubIdentity,
  updatePublicProfileGist,
} from "@oompf/github";
import { type Cli, z } from "incur";

import {
  fetchProfileMetadata,
  parseOompfRef,
  registerProfile,
} from "../api.ts";
import { CommandError, type ResolvedDeps, toCliError } from "../deps.ts";
import { cliEnv, upgradeOutput } from "../output.ts";

function toOompfUrl(baseUrl: string, id: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/p/${id}`;
}

function currentGistUrl(gistId: string): string {
  return `https://api.github.com/gists/${gistId}`;
}

/** Register the `upgrade` command on the given CLI. */
export function registerUpgrade(cli: Cli.Cli, deps: ResolvedDeps): void {
  cli.command("upgrade", {
    args: z.object({
      ref: z.string().describe("OOMPF profile URL or stable profile id"),
    }),
    description:
      "Review and optionally apply model upgrades to an OOMPF profile",
    env: cliEnv,
    examples: [
      {
        args: { ref: "https://oompf.run/p/prof_..." },
        description: "Preview model upgrades for an indexed profile",
      },
    ],
    options: z.object({
      yes: z
        .boolean()
        .optional()
        .describe("Apply the reviewed plan without prompting"),
    }),
    output: upgradeOutput,
    async run(c) {
      try {
        const id = parseOompfRef(c.args.ref);
        if (id === null) {
          throw new CommandError(
            "invalid_ref",
            "Upgrade requires an OOMPF profile URL or stable profile id."
          );
        }

        const record = await fetchProfileMetadata(
          c.env.OOMPF_BASE_URL,
          id,
          deps.httpFetch
        );
        if (record.gistId === null || record.gistId === undefined) {
          throw new CommandError(
            "unverifiable_artifact",
            "The indexed profile has no source Gist and cannot be upgraded."
          );
        }

        const fetchCurrent = () =>
          fetchPublicGist(currentGistUrl(record.gistId!), {
            fetch: deps.gistFetch,
          });
        const current = await fetchCurrent();
        if (current.owner === null) {
          throw new CommandError(
            "unowned_gist",
            "The source Gist has no public owner and cannot be patched."
          );
        }

        const plan = proposeUpgrade(current.content, MODEL_CATALOG);
        const output = {
          catalogRevision: plan.catalogRevision,
          changes: [...plan.changes],
          currentRevision: current.revision ?? record.revision ?? "unknown",
          oompfUrl: toOompfUrl(c.env.OOMPF_BASE_URL, record.id),
          unchanged: [...plan.unchanged],
          updatedRevision: null as string | null,
        };

        const shouldPrompt =
          c.options.yes !== true &&
          !c.formatExplicit &&
          deps.profileSelector.isInteractive();
        if (!(c.options.yes || shouldPrompt)) {
          return c.ok(output);
        }
        if (shouldPrompt) {
          const answer = await confirm({
            message:
              plan.changes.length === 0
                ? "No model changes are proposed. Exit without writing?"
                : `Apply ${plan.changes.length} model change(s) to the current Gist?`,
          });
          if (isCancel(answer) || answer !== true) {
            return c.ok(output);
          }
        }
        if (plan.changes.length === 0) {
          return c.ok(output);
        }

        const latest = await fetchCurrent();
        if (latest.contentHash !== current.contentHash) {
          throw new CommandError(
            "head_changed",
            "The source Gist changed while the upgrade was being reviewed. Run upgrade again to plan from the new head."
          );
        }
        const identity = await getGithubIdentity({
          ghCommand: deps.ghCommand,
          runner: deps.runner,
        });
        if (latest.owner?.toLowerCase() !== identity.login.toLowerCase()) {
          throw new CommandError(
            "unowned_gist",
            "The authenticated GitHub user does not own the source Gist; refusing to patch it."
          );
        }

        const validation = validateArtifact({ yaml: plan.yaml });
        if (validation.structural === "invalid" || validation.facts === null) {
          throw new CommandError(
            "invalid_artifact",
            `The upgraded profile is structurally invalid: ${validation.errors.join("; ")}`
          );
        }
        if (validation.blocking.length > 0) {
          throw new CommandError(
            "blocking_secrets",
            "Refusing to patch the Gist: the upgraded profile contains high-confidence secrets."
          );
        }

        const updated = await updatePublicProfileGist(
          {
            content: plan.yaml,
            filename: latest.filename,
            gistId: latest.gistId,
          },
          { ghCommand: deps.ghCommand, runner: deps.runner }
        );
        try {
          await registerProfile(
            c.env.OOMPF_BASE_URL,
            { source: record.sourceUrl },
            deps.httpFetch
          );
        } catch (error) {
          throw new CommandError(
            "index_update_failed",
            `The Gist was updated but OOMPF could not refresh its index. Retry upgrade to repair the index: ${error instanceof Error ? error.message : String(error)}`
          );
        }
        return c.ok({ ...output, updatedRevision: updated.revision });
      } catch (error) {
        return toCliError(c.error, error);
      }
    },
  });
}

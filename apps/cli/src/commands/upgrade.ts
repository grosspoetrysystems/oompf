/**
 * `oompf upgrade <ref>` — review and optionally apply model-only successors.
 *
 * The command plans from the current Gist head, not the indexed pinned
 * revision. It patches that Gist only after confirmation and ownership checks,
 * then registers the unchanged source URL so the stable OOMPF profile identity
 * survives.
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
  confirmIndexedHash,
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

        const plan = proposeUpgrade(current.content, MODEL_CATALOG);
        const output = {
          catalogRevision: plan.catalogRevision,
          changes: [...plan.changes],
          currentRevision: current.revision ?? record.revision ?? "unknown",
          oompfUrl: toOompfUrl(c.env.OOMPF_BASE_URL, record.id),
          unchanged: [...plan.unchanged],
          updatedRevision: null as string | null,
        };
        const needsIndexReconciliation =
          current.contentHash !== record.contentHash;

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
                ? needsIndexReconciliation
                  ? "The Gist is current but its OOMPF index is stale. Refresh the index without modifying the Gist?"
                  : "No model changes are proposed. Exit without writing?"
                : `Apply ${plan.changes.length} model change(s) to the current Gist?`,
          });
          if (isCancel(answer) || answer !== true) {
            return c.ok(output);
          }
        }
        if (plan.changes.length === 0) {
          if (!needsIndexReconciliation) {
            return c.ok(output);
          }
          try {
            await registerProfile(
              c.env.OOMPF_BASE_URL,
              { source: record.sourceUrl },
              deps.httpFetch
            );
            await confirmIndexedHash({
              baseUrl: c.env.OOMPF_BASE_URL,
              expectedHash: current.contentHash,
              fetchImpl: deps.httpFetch,
              id: record.id,
              sleep: deps.sleep,
              source: record.sourceUrl,
            });
          } catch (error) {
            if (
              error instanceof CommandError &&
              error.code === "rate_limited"
            ) {
              throw new CommandError(
                "rate_limited",
                `The canonical Gist at ${record.sourceUrl} is current, but index reconciliation for indexed profile ${output.oompfUrl} was rate-limited. Wait at least a minute, then retry the original upgrade command; this command will not patch the Gist. Details: ${error.message}`
              );
            }
            if (
              error instanceof CommandError &&
              error.code === "index_update_failed"
            ) {
              throw error;
            }
            throw new CommandError(
              "index_update_failed",
              `The canonical Gist at ${record.sourceUrl} is current, but OOMPF could not reconcile indexed profile ${output.oompfUrl}; installs through it may still serve the previous pinned revision. Wait at least a minute, then retry the original upgrade command; this command will not patch the Gist again. Details: ${error instanceof Error ? error.message : String(error)}`
            );
          }
          return c.ok(output);
        }

        // Public index reconciliation does not patch the Gist, so ownership
        // is required only for the model-changing path below.
        if (current.owner === null) {
          throw new CommandError(
            "unowned_gist",
            "The source Gist has no public owner and cannot be patched."
          );
        }
        const latest = await fetchCurrent();
        // The second fetch closes the review-time race. GitHub's Gist PATCH
        // endpoint does not expose a reliable If-Match precondition, so a
        // concurrent edit after this check remains an unavoidable last-mile
        // race; the command never pretends the API is transactional.
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
          if (error instanceof CommandError && error.code === "rate_limited") {
            throw new CommandError(
              "rate_limited",
              `The canonical Gist at ${record.sourceUrl} is current, but registration of indexed profile ${output.oompfUrl} was rate-limited. The indexed profile may still serve the previous pinned revision. Wait at least a minute, then retry the original upgrade command; it will not patch the Gist twice. Details: ${error.message}`
            );
          }
          throw new CommandError(
            "index_update_failed",
            `The canonical Gist at ${record.sourceUrl} is current, but OOMPF could not refresh indexed profile ${output.oompfUrl}; it may still serve the previous pinned revision. Wait at least a minute, then retry the original upgrade command; it will not patch the Gist twice. Details: ${error instanceof Error ? error.message : String(error)}`
          );
        }
        // A 200 is not proof the index read the patched Gist; only the stored
        // hash is. Same exposure as `publish`, same remedy.
        await confirmIndexedHash({
          baseUrl: c.env.OOMPF_BASE_URL,
          expectedHash: validation.hash,
          fetchImpl: deps.httpFetch,
          id: record.id,
          sleep: deps.sleep,
          source: record.sourceUrl,
        });
        return c.ok({ ...output, updatedRevision: updated.revision });
      } catch (error) {
        return toCliError(c.error, error);
      }
    },
  });
}

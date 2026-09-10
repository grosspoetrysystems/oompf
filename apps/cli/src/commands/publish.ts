/**
 * `oompf publish [profile]` — share a local OMP profile as a public Gist and
 * register it with the OOMPF index.
 *
 * The command resolves a named profile through `@oompf/core`, validates and
 * scans its canonical `config.yml`, verifies `gh` authentication, publishes the
 * artifact through `@oompf/github`, registers it with the web API, and prints
 * the GitHub URL, OOMPF URL, hash, and a copyable add command. It never
 * publishes credentials, project overlays, or unrelated files: only the single
 * selected config artifact is sent, and high-confidence secrets abort the
 * publish before anything leaves the machine.
 *
 * Publishing a profile that was published before patches that same Gist rather
 * than creating another one, so the `/p/<id>` its author already shared keeps
 * serving current bytes. The prior Gist comes from the local publication store;
 * a Gist that has since been deleted or transferred is reported instead of
 * being silently forked into a second identity, and `--new` opts out
 * deliberately.
 *
 * "Keeps serving current bytes" is checked, not assumed: a patched publish
 * confirms the index stores the hash it just wrote before reporting success.
 */

import {
  type DiscoveredProfile,
  OmpProfileNotFoundError,
  validateArtifact,
  validateProfileName,
} from "@oompf/core";
import {
  createPublicProfileGist,
  fetchPublicGist,
  type GistSource,
  getGithubIdentity,
  type UpdatedGist,
  updatePublicProfileGist,
} from "@oompf/github";
import { type Cli, z } from "incur";

import {
  fetchProfileMetadata,
  type RegisterResponse,
  registerProfile,
} from "../api.ts";
import { CommandError, type ResolvedDeps, toCliError } from "../deps.ts";
import { cliEnv, publishOutput } from "../output.ts";
import {
  type Publication,
  readPublication,
  writePublication,
} from "../publications.ts";

/** Narrow a discovered profile to one that carries a publishable config. */
function hasConfig(
  profile: DiscoveredProfile
): profile is DiscoveredProfile & { readonly configPath: string } {
  return profile.configPath !== null;
}

/** Concatenate the base URL and a site-relative path from the register call. */
function toOompfUrl(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/+$/, "")}${path.startsWith("/") ? path : `/${path}`}`;
}

/**
 * Patch the Gist a profile was previously published to, refusing anything that
 * would quietly hand the author a different public identity: a Gist that is
 * gone (deleted or made private) and one that the authenticated user does not
 * own are both reported, never forked.
 */
async function patchPriorGist(
  deps: ResolvedDeps,
  prior: Publication,
  yaml: string,
  login: string
): Promise<UpdatedGist> {
  let current: GistSource;
  try {
    current = await fetchPublicGist(
      `https://api.github.com/gists/${prior.gistId}`,
      { fetch: deps.gistFetch }
    );
  } catch (error) {
    throw new CommandError(
      "missing_gist",
      `The Gist this profile was published to (${prior.gistId}) is unreachable — it may have been deleted or made private. Publish a separate new one with --new. Details: ${error instanceof Error ? error.message : String(error)}`
    );
  }
  if (current.owner?.toLowerCase() !== login.toLowerCase()) {
    throw new CommandError(
      "unowned_gist",
      `The Gist this profile was published to (${prior.gistId}) is owned by ${current.owner ?? "nobody"}, not ${login}. Refusing to patch it; publish a separate new one with --new.`
    );
  }
  return await updatePublicProfileGist(
    { content: yaml, filename: prior.filename, gistId: prior.gistId },
    { ghCommand: deps.ghCommand, runner: deps.runner }
  );
}

/**
 * Waits between re-registrations, in milliseconds.
 *
 * GitHub serves a patched Gist's prior revision to readers for a while after
 * the PATCH returns. Measured on a real Gist: fresh after 5.8s once, still
 * stale after 14.6s once, and stale for somewhere under 80s once. The schedule
 * covers the first two outright and gives up rather than making the author
 * wait for the third, which one more `publish` resolves.
 */
const INDEX_REFRESH_WAITS_MS = [1000, 2000, 4000, 8000, 15_000] as const;

/**
 * Prove the index is serving the bytes this publish just wrote.
 *
 * Registered a second after the PATCH, the indexer was served the pre-patch
 * revision and stored its hash, metadata, facts, and revision under the same
 * `/p/<id>` — while the command reported success. Nothing repairs that
 * afterwards: the source sweep only stamps `sourceChangedAt`, and `add`
 * installs from the pinned revision, so every later install silently receives
 * the previous profile. Re-register until the indexed hash is the published
 * one, and say so when it never is.
 */
async function confirmIndexRefreshed(
  deps: ResolvedDeps,
  baseUrl: string,
  id: string,
  source: string,
  expectedHash: string
): Promise<void> {
  let indexed = "";
  for (let attempt = 0; attempt <= INDEX_REFRESH_WAITS_MS.length; attempt++) {
    const record = await fetchProfileMetadata(baseUrl, id, deps.httpFetch);
    indexed = record.contentHash;
    if (indexed === expectedHash) {
      return;
    }
    const wait = INDEX_REFRESH_WAITS_MS[attempt];
    if (wait !== undefined) {
      await deps.sleep(wait);
      await registerProfile(baseUrl, { source }, deps.httpFetch);
    }
  }
  throw new CommandError(
    "index_update_failed",
    `The Gist was updated but OOMPF is still indexing ${indexed.slice(0, 12)} rather than the bytes just published (${expectedHash.slice(0, 12)}), so ${source} would keep serving the previous version. The Gist is already current: publish again in a minute.`
  );
}

/** Register the `publish` command on the given CLI. */
export function registerPublish(cli: Cli.Cli, deps: ResolvedDeps): void {
  cli.command("publish", {
    args: z.object({
      profile: z
        .string()
        .optional()
        .describe(
          "Native OMP profile name; omitted selects a publishable profile"
        ),
    }),
    description: "Publish a local OMP profile as a public Gist and index it",
    env: cliEnv,
    examples: [
      { args: { profile: "work" }, description: "Publish the 'work' profile" },
    ],
    options: z.object({
      agent: z
        .enum(["omp", "pi"])
        .optional()
        .describe("Agent runtime to use (default: omp)"),
      new: z
        .boolean()
        .optional()
        .describe(
          "Publish a separate new Gist instead of updating the one this profile was published to"
        ),
    }),
    output: publishOutput,
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
        const ompOptions = { ompCommand };

        // 1. Validate the named profile, or derive it when unambiguous.
        let name: string;
        let configPath: string | null;
        if (c.args.profile === undefined) {
          const discovered = await deps.discoverProfiles(ompOptions);
          const publishable = discovered.filter(hasConfig);

          if (publishable.length === 0) {
            throw new CommandError(
              "no_profile",
              "No publishable OMP profiles found. Create a profile with config.yml/config.yaml or pass an existing profile name."
            );
          }

          let selected = publishable[0]!;
          if (publishable.length > 1) {
            const names = publishable.map((profile) => profile.name);
            if (c.formatExplicit || !deps.profileSelector.isInteractive()) {
              throw new CommandError(
                "ambiguous_profile",
                `Multiple publishable profiles found (${names.join(", ")}). Specify one: oompf publish <profile>.`
              );
            }
            const selectedName =
              await deps.profileSelector.selectProfile(names);
            if (selectedName === null) {
              throw new CommandError(
                "selection_cancelled",
                "Profile selection was cancelled. Nothing was published."
              );
            }
            const picked = publishable.find(
              (profile) => profile.name === selectedName
            );
            if (picked === undefined) {
              throw new CommandError(
                "selection_invariant",
                "The profile selector returned a name that was not offered."
              );
            }
            selected = picked;
          }
          name = selected.name;
          configPath = selected.configPath;
        } else {
          const validation = validateProfileName(c.args.profile);
          if (!validation.ok) {
            throw new CommandError("invalid_profile", validation.reason);
          }
          try {
            const resolved = await deps.resolveProfileConfig(
              validation.value,
              ompOptions
            );
            name = resolved.profile;
            configPath = resolved.configPath;
          } catch (error) {
            if (error instanceof OmpProfileNotFoundError) {
              throw new CommandError(
                "profile_not_found",
                `OMP profile "${validation.value}" was not found.`
              );
            }
            throw error;
          }
        }

        if (configPath === null) {
          throw new CommandError(
            "missing_config",
            `Profile "${name}" has no config.yml/config.yaml to publish.`
          );
        }

        // 2. Read, validate, and secret-scan the canonical artifact.
        const yaml = await deps.fs.readFile(configPath);
        const validation = validateArtifact({ yaml });
        if (validation.structural === "invalid") {
          throw new CommandError(
            "invalid_artifact",
            `Profile "${name}" is not a valid artifact: ${validation.errors.join("; ")}`
          );
        }
        if (validation.blocking.length > 0) {
          const where = validation.blocking.map((f) => f.path).join(", ");
          throw new CommandError(
            "blocking_secrets",
            `Refusing to publish: high-confidence secrets detected at ${where}. Remove them and retry.`
          );
        }

        // 3. Verify GitHub authentication before creating anything.
        const identity = await getGithubIdentity({
          ghCommand: deps.ghCommand,
          runner: deps.runner,
        });

        // 4. Publish: patch the Gist this profile already owns, or create one.
        const prior =
          c.options.new === true
            ? null
            : await readPublication(deps.fs, deps.publicationsPath, name);
        const gist = prior
          ? await patchPriorGist(deps, prior, yaml, identity.login)
          : await createPublicProfileGist(
              {
                content: yaml,
                description: `OMP profile "${name}" shared via OOMPF`,
                filename: `${name}.yml`,
              },
              { ghCommand: deps.ghCommand, runner: deps.runner }
            );

        // The YAML setupVersion is a config schema marker, not the installed
        // OMP runtime version. Register only explicitly supplied metadata.
        // Replaying the recorded source URL is what keeps `/p/<id>` stable.
        let registration: RegisterResponse;
        try {
          registration = await registerProfile(
            c.env.OOMPF_BASE_URL,
            { source: prior ? prior.source : gist.htmlUrl },
            deps.httpFetch
          );
        } catch (error) {
          if (prior === null) {
            throw error;
          }
          // The Gist already carries the new bytes; only the index is behind.
          // Say so, and name the source URL the author can re-register.
          throw new CommandError(
            "index_update_failed",
            `The Gist was updated but OOMPF could not refresh its index. Publish again once the index recovers, or register ${prior.source} directly; the Gist is already current. Details: ${error instanceof Error ? error.message : String(error)}`
          );
        }

        // A 200 is not proof the index read the patched Gist; only the stored
        // hash is.
        if (prior) {
          await confirmIndexRefreshed(
            deps,
            c.env.OOMPF_BASE_URL,
            registration.id,
            prior.source,
            validation.hash
          );
        }

        // Remember the identity only once the index has accepted it, so a
        // failed registration cannot strand the profile on an unindexed Gist.
        if (prior === null) {
          await writePublication(deps.fs, deps.publicationsPath, name, {
            filename: `${name}.yml`,
            gistId: gist.gistId,
            source: gist.htmlUrl,
          });
        }

        const oompfUrl = toOompfUrl(c.env.OOMPF_BASE_URL, registration.url);
        const addCommand = `oompf add ${oompfUrl}`;
        return c.ok(
          {
            addCommand,
            aliases: validation.facts ? [...validation.facts.aliases] : [],
            gistId: gist.gistId,
            githubUrl: gist.htmlUrl,
            hash: validation.hash,
            metadata: {
              ...validation.metadata,
              links: [...validation.metadata.links],
              tags: [...validation.metadata.tags],
            },
            oompfUrl,
            profile: name,
            publication: prior ? ("updated" as const) : ("created" as const),
            revision: "revision" in gist ? gist.revision : null,
            structural: registration.validation.structural,
            warnings: [
              ...validation.warnings,
              ...registration.validation.warnings,
            ],
          },
          {
            cta: {
              commands: [{ command: addCommand }],
              description: prior
                ? `Updated in place — the link you already shared is unchanged: ${oompfUrl}\nAnyone who has it installs the new bytes with:`
                : `Your link: ${oompfUrl}\nShare it — anyone who has it installs the profile with:`,
            },
          }
        );
      } catch (error) {
        return toCliError(c.error, error);
      }
    },
  });
}

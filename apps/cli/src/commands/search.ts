/**
 * `oompf search [query]` — search the OOMPF index and render compact records.
 *
 * Delegates to `GET /api/search?q=` and projects each result to a compact,
 * metadata-only row. Human output is a terse table; `--json` returns the same
 * records machine-readably.
 */

import { type Cli, z } from "incur";

import { searchProfiles } from "../api.ts";
import { type ResolvedDeps, toCliError } from "../deps.ts";
import { cliEnv, searchOutput } from "../output.ts";

/** Register the `search` command on the given CLI. */
export function registerSearch(cli: Cli.Cli, deps: ResolvedDeps): void {
  cli.command("search", {
    args: z.object({
      query: z.string().optional().describe("Free-text query; empty lists all"),
    }),
    description: "Search the OOMPF index for shared profiles",
    env: cliEnv,
    examples: [
      { args: { query: "anthropic" }, description: "Search for a term" },
    ],
    output: searchOutput,
    async run(c) {
      try {
        const query = c.args.query ?? "";
        const response = await searchProfiles(
          c.env.OOMPF_BASE_URL,
          query,
          deps.httpFetch
        );
        return c.ok({
          count: response.results.length,
          query: response.query,
          results: response.results.map((r) => ({
            id: r.id,
            models: [...r.models],
            name: r.name,
            owner: r.owner,
            providers: [...r.providers],
            revision: r.revision,
            source: r.source,
            structural: r.structural,
            updatedAt: r.updatedAt,
            url: r.url,
          })),
        });
      } catch (error) {
        return toCliError(c.error, error);
      }
    },
  });
}

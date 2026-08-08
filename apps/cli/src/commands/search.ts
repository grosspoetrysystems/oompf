/**
 * `oompf search [query]` — search the OOMPF index and render compact records.
 *
 * Delegates to `GET /api/search?q=` and projects each result to a compact,
 * metadata-only row. Human output is a terse table; `--json` returns the same
 * records machine-readably.
 */

import { z, type Cli } from "incur";

import { searchProfiles } from "../api.ts";
import { toCliError, type ResolvedDeps } from "../deps.ts";
import { cliEnv, searchOutput } from "../output.ts";

/** Register the `search` command on the given CLI. */
export function registerSearch(cli: Cli.Cli, deps: ResolvedDeps): void {
  cli.command("search", {
    description: "Search the OOMPF index for shared profiles",
    args: z.object({
      query: z.string().optional().describe("Free-text query; empty lists all"),
    }),
    env: cliEnv,
    output: searchOutput,
    examples: [
      { args: { query: "anthropic" }, description: "Search for a term" },
    ],
    async run(c) {
      try {
        const query = c.args.query ?? "";
        const response = await searchProfiles(
          c.env.OOMPF_BASE_URL,
          query,
          deps.httpFetch,
        );
        return c.ok({
          query: response.query,
          count: response.results.length,
          results: response.results.map((r) => ({
            id: r.id,
            name: r.name,
            owner: r.owner,
            source: r.source,
            revision: r.revision,
            structural: r.structural,
            models: [...r.models],
            providers: [...r.providers],
            url: r.url,
            updatedAt: r.updatedAt,
          })),
        });
      } catch (error) {
        return toCliError(c.error, error);
      }
    },
  });
}

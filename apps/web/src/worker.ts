/**
 * The Cloudflare Worker entrypoint (`main` in `wrangler.jsonc`).
 *
 * Astro's adapter ships its own entrypoint, `@astrojs/cloudflare/entrypoints/
 * server`, which exports nothing but `fetch`. A Worker can only answer a Cron
 * Trigger through a `scheduled` export, so the freshness sweep needs an
 * entrypoint carrying both. Rather than reassembling request handling from the
 * adapter's lower-level `cf()`/`astro()` handlers — and silently drifting from
 * whatever asset serving, session binding, `waitUntil` and locals wiring the
 * adapter does next — this re-exports the adapter's own `fetch` verbatim and
 * adds `scheduled` beside it.
 *
 * Running the sweep here rather than behind an HTTP route is deliberate: cron
 * invokes this handler inside the Worker, so there is no public refresh
 * endpoint for anyone to point a script at, and no shared secret to hold.
 *
 * `DATABASE_URL` arrives on the handler's own `env` argument. The request path
 * reads it from `cloudflare:workers` instead (see `resolveRepository`), because
 * an Astro route has no `env` parameter; a scheduled handler does, so it uses
 * the direct, unambiguous one.
 */

import server from "@astrojs/cloudflare/entrypoints/server";
import { createNeonDatabase, createProfileRepository } from "@oompf/database";

import { sweepSourceChecks } from "./lib/services/source-check.ts";

/** The scheduled handler's slice of the Worker environment. */
interface ScheduledEnv {
  readonly DATABASE_URL?: string;
}

export default {
  fetch: server.fetch,
  async scheduled(
    controller: { readonly cron: string },
    env: ScheduledEnv
  ): Promise<void> {
    const url = env.DATABASE_URL;
    if (url === undefined || url.trim() === "") {
      // Value-free, and loud: an unconfigured database means every indexed
      // source silently stops being re-checked.
      console.warn(
        "source sweep skipped: DATABASE_URL is absent from the Worker environment"
      );
      return;
    }
    const summary = await sweepSourceChecks({
      repository: createProfileRepository(createNeonDatabase(url)),
    });
    console.warn(
      `source sweep (${controller.cron}): checked ${summary.checked}, changed ${summary.changed}, failed ${summary.failed}`
    );
  },
};

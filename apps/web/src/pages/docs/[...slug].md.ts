/**
 * `GET /docs/<slug>.md` — the clean Markdown variant of a documentation page.
 *
 * Serves the collection entry's raw Markdown body (the single source of truth
 * the HTML page renders from) with a `text/markdown` content type, so agents
 * consume documentation without scraping HTML.
 */

import { getCollection } from "astro:content";
import type { APIRoute, GetStaticPaths } from "astro";

export const prerender = true;

export const getStaticPaths = (async () => {
  const entries = await getCollection("docs");
  return entries.map((entry) => ({
    params: { slug: entry.id },
    props: { body: entry.body ?? "" },
  }));
}) satisfies GetStaticPaths;

export const GET: APIRoute<{ body: string }> = ({ props }) =>
  new Response(props.body, {
    headers: { "content-type": "text/markdown; charset=utf-8" },
    status: 200,
  });

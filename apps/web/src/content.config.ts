/**
 * Content collections for the OOMPF site.
 *
 * `docs` is the single source of truth for the `/docs` authority: each entry
 * renders to an HTML page and exposes a clean Markdown variant at
 * `/docs/<id>.md`. Frontmatter drives ordering, the sidebar/section grouping,
 * and the `llms.txt` indexes.
 */

import { defineCollection, z } from "astro:content";
import { glob } from "astro/loaders";

const docs = defineCollection({
  loader: glob({ base: "./src/content/docs", pattern: "**/*.md" }),
  schema: z.object({
    /** Ordinal within the section; lower sorts first. */
    order: z.number(),
    /** Section this page groups under in navigation and the docs index. */
    section: z.string(),
    /** One-line description used in navigation and the llms.txt indexes. */
    summary: z.string(),
    /** Page title. */
    title: z.string(),
  }),
});

export const collections = { docs };

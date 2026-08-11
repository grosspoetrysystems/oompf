/**
 * `GET /schemas/error.json` — the stable error-envelope JSON Schema (2020-12).
 * Prerendered static asset; source of truth in `lib/contracts/error-schema.ts`.
 */

import type { APIRoute } from "astro";

import { errorSchema } from "../../lib/contracts/error-schema.ts";

export const prerender = true;

export const GET: APIRoute = () =>
  new Response(JSON.stringify(errorSchema, null, 2), {
    headers: { "content-type": "application/schema+json; charset=utf-8" },
    status: 200,
  });

/**
 * `GET /openapi.json` — the canonical OpenAPI 3.1 description of the OOMPF API.
 *
 * Prerendered static asset; the document is the single source of truth built in
 * `lib/contracts/openapi.ts`.
 */

import type { APIRoute } from "astro";

import { openApiDocument } from "../lib/contracts/openapi.ts";

export const prerender = true;

export const GET: APIRoute = () =>
  new Response(JSON.stringify(openApiDocument, null, 2), {
    headers: { "content-type": "application/json; charset=utf-8" },
    status: 200,
  });

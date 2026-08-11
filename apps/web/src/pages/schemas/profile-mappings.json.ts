/**
 * `GET /schemas/profile-mappings.json` — JSON Schema (2020-12) for the curated
 * provider/model mapping responses. Prerendered static asset; source of truth
 * in `lib/contracts/profile-mappings-schema.ts`.
 */

import type { APIRoute } from "astro";

import { profileMappingsSchema } from "../../lib/contracts/profile-mappings-schema.ts";

export const prerender = true;

export const GET: APIRoute = () =>
  new Response(JSON.stringify(profileMappingsSchema, null, 2), {
    headers: { "content-type": "application/schema+json; charset=utf-8" },
    status: 200,
  });

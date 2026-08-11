/**
 * `GET /schemas/profile-metadata.json` — JSON Schema (2020-12) for the profile
 * metadata record. Prerendered static asset; source of truth in
 * `lib/contracts/profile-metadata-schema.ts`.
 */

import type { APIRoute } from "astro";

import { profileMetadataSchema } from "../../lib/contracts/profile-metadata-schema.ts";

export const prerender = true;

export const GET: APIRoute = () =>
  new Response(JSON.stringify(profileMetadataSchema, null, 2), {
    headers: { "content-type": "application/schema+json; charset=utf-8" },
    status: 200,
  });

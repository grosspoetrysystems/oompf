/**
 * `GET /api/search?q=...` — free-text search over the profile index.
 *
 * Returns `{ query, results }` where each result is a compact, metadata-only
 * record suitable for listings. Errors use the stable JSON error envelope.
 */

import type { APIRoute } from "astro";

import {
  searchIndexedProfiles,
  resolveRepository,
  toErrorEnvelope,
  jsonResponse,
  type AppLocals,
} from "../../lib/services/index-profile.ts";

export const prerender = false;

export const GET: APIRoute = async ({ url, locals }) => {
  const appLocals = locals as unknown as AppLocals;
  try {
    const repository = await resolveRepository(appLocals);
    const query = url.searchParams.get("q") ?? "";
    const results = await searchIndexedProfiles(repository, query);
    return jsonResponse(200, { query, results });
  } catch (error) {
    const { status, body } = toErrorEnvelope(error);
    return jsonResponse(status, body);
  }
};

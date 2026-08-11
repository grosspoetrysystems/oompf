/**
 * `GET /api/v1/search?q=...` — free-text search over the profile index.
 *
 * Canonical, versioned agent route. Returns `{ query, results }` where each
 * result is a compact, metadata-only summary suitable for listings (name,
 * models, providers, OOMPF summary/kind/tags, structural verdict, provenance
 * coordinates). Errors use the stable JSON error envelope. The unversioned
 * `/api/search` route re-exports this handler as a compatibility alias.
 */

import type { APIRoute } from "astro";

import {
  type AppLocals,
  jsonResponse,
  resolveRepository,
  searchIndexedProfiles,
  toErrorEnvelope,
} from "../../../lib/services/index-profile.ts";

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

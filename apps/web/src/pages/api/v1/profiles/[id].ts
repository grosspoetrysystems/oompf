/**
 * `GET /api/v1/profiles/:id` — fetch a single profile's metadata.
 *
 * Canonical, versioned agent route. Returns the persisted metadata record
 * (facts + structural validation + OOMPF metadata + provenance) as JSON, or a
 * `not_found` error envelope with HTTP 404. The stored row carries no canonical
 * artifact content, so nothing here can leak the source bytes. The unversioned
 * `/api/profiles/:id` route re-exports this handler as a compatibility alias.
 */

import type { APIRoute } from "astro";

import {
  type AppLocals,
  getProfileMetadata,
  jsonResponse,
  READ_CACHE_CONTROL,
  resolveRepository,
  toErrorEnvelope,
} from "../../../../lib/services/index-profile.ts";

export const prerender = false;

export const GET: APIRoute = async ({ params, locals }) => {
  const appLocals = locals as unknown as AppLocals;
  try {
    const repository = await resolveRepository(appLocals);
    const record = await getProfileMetadata(repository, params.id ?? "");
    return jsonResponse(200, record, READ_CACHE_CONTROL);
  } catch (error) {
    const { status, body } = toErrorEnvelope(error);
    return jsonResponse(status, body);
  }
};

/**
 * `GET /api/profiles/:id` — fetch a single profile's metadata.
 *
 * Returns the persisted metadata record (facts + structural validation) as
 * JSON, or a `not_found` error envelope with HTTP 404. The stored row carries
 * no canonical artifact content, so nothing here can leak the source bytes.
 */

import type { APIRoute } from "astro";

import {
  type AppLocals,
  getProfileMetadata,
  jsonResponse,
  resolveRepository,
  toErrorEnvelope,
} from "../../../lib/services/index-profile.ts";

export const prerender = false;

export const GET: APIRoute = async ({ params, locals }) => {
  const appLocals = locals as unknown as AppLocals;
  try {
    const repository = await resolveRepository(appLocals);
    const record = await getProfileMetadata(repository, params.id ?? "");
    return jsonResponse(200, record);
  } catch (error) {
    const { status, body } = toErrorEnvelope(error);
    return jsonResponse(status, body);
  }
};

/**
 * `POST /api/v1/profiles` — register (index) a public Gist.
 *
 * Canonical, versioned agent route. Accepts `{ source: string, ompVersion?:
 * string }` and returns `{ id, url, source, validation }` on success. All
 * failures return the stable JSON error envelope with a status-specific HTTP
 * code. This route persists and returns metadata only — never canonical
 * artifact content. The unversioned `/api/profiles` route re-exports this
 * handler as a compatibility alias during the v0 transition.
 */

import type { APIRoute } from "astro";

import {
  type AppLocals,
  indexPublicGist,
  jsonResponse,
  parseRegisterBody,
  resolveRepository,
  toErrorEnvelope,
  toRegisterResponse,
} from "../../../lib/services/index-profile.ts";

export const prerender = false;

export const POST: APIRoute = async ({ request, locals }) => {
  const appLocals = locals as unknown as AppLocals;
  try {
    const repository = await resolveRepository(appLocals);
    const input = await parseRegisterBody(request);
    const record = await indexPublicGist(input, {
      fetchGist: appLocals.fetchGist,
      repository,
    });
    return jsonResponse(200, toRegisterResponse(record));
  } catch (error) {
    const { status, body } = toErrorEnvelope(error);
    return jsonResponse(status, body);
  }
};

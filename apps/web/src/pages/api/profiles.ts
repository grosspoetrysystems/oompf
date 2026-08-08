/**
 * `POST /api/profiles` — register (index) a public Gist.
 *
 * Accepts `{ source: string, ompVersion?: string }` and returns
 * `{ id, url, source, validation }` on success. All failures return the stable
 * JSON error envelope with a status-specific HTTP code. This route persists and
 * returns metadata only — never canonical artifact content.
 */

import type { APIRoute } from "astro";

import {
  indexPublicGist,
  parseRegisterBody,
  resolveRepository,
  toErrorEnvelope,
  toRegisterResponse,
  jsonResponse,
  type AppLocals,
} from "../../lib/services/index-profile.ts";

export const prerender = false;

export const POST: APIRoute = async ({ request, locals }) => {
  const appLocals = locals as unknown as AppLocals;
  try {
    const repository = resolveRepository(appLocals);
    const input = await parseRegisterBody(request);
    const record = await indexPublicGist(input, {
      repository,
      fetchGist: appLocals.fetchGist,
    });
    return jsonResponse(200, toRegisterResponse(record));
  } catch (error) {
    const { status, body } = toErrorEnvelope(error);
    return jsonResponse(status, body);
  }
};

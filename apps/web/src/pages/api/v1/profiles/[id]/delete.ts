/**
 * `POST /api/v1/profiles/:id/delete` — soft-delete a profile.
 *
 * Marks the profile removed so it leaves read lookups (`GET /api/v1/profiles/:id`
 * and re-registration by source) while the row survives for provenance. Returns
 * `{ id, deleted: true }` (HTTP 200) on success, or a `not_found` error
 * envelope (HTTP 404) when no such profile row exists. Idempotent: deleting an
 * already-deleted profile returns the same success envelope. Like the rest of
 * v0 this route is unauthenticated, which the removal ticket accepts for now —
 * a real admin surface with accounts is a follow-up.
 */

import type { APIRoute } from "astro";

import {
  type AppLocals,
  IndexError,
  jsonResponse,
  resolveRepository,
  toErrorEnvelope,
} from "../../../../../lib/services/index-profile.ts";

export const prerender = false;

export const POST: APIRoute = async ({ params, locals }) => {
  const appLocals = locals as unknown as AppLocals;
  try {
    const id = params.id ?? "";
    const repository = await resolveRepository(appLocals);
    const record = await repository.softDeleteProfile(id);
    if (record === null) {
      throw new IndexError(
        "not_found",
        404,
        `No indexed profile with id "${id}".`
      );
    }
    return jsonResponse(200, { deleted: true, id: record.id });
  } catch (error) {
    const { status, body } = toErrorEnvelope(error);
    return jsonResponse(status, body);
  }
};

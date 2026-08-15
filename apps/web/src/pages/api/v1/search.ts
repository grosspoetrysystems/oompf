/**
 * `GET /api/v1/search?q=...` — free-text search over the profile index.
 *
 * Canonical, versioned agent route. Returns `{ query, results }` where each
 * result is a compact, metadata-only summary suitable for listings (name,
 * models, providers, OOMPF summary/kind/tags, structural verdict, provenance
 * coordinates). Errors use the stable JSON error envelope. The unversioned
 * `/api/search` route re-exports this handler as a compatibility alias.
 */

import { decodeCursor } from "@oompf/database";
import type { APIRoute } from "astro";

import {
  type AppLocals,
  jsonResponse,
  READ_CACHE_CONTROL,
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
    // A non-numeric/absent limit passes through as `undefined`, and the
    // repository applies its own default-and-clamp (50 default, 100 max).
    const rawLimit = url.searchParams.get("limit");
    const limit =
      rawLimit !== null && /^\d+$/.test(rawLimit)
        ? Number(rawLimit)
        : undefined;
    // A present-but-malformed cursor is a client error, surfaced with the
    // standard 400 envelope; an absent cursor simply starts from the top. The
    // raw cursor string is passed through unchanged so the repository decodes
    // once, at the boundary that owns the format.
    const cursorParam = url.searchParams.get("cursor");
    if (cursorParam !== null && decodeCursor(cursorParam) === null) {
      return jsonResponse(400, {
        error: {
          code: "invalid_cursor",
          message: "The `cursor` query parameter is malformed.",
        },
      });
    }
    const { results, nextCursor } = await searchIndexedProfiles(
      repository,
      query,
      limit,
      cursorParam
    );
    return jsonResponse(
      200,
      { nextCursor, query, results },
      READ_CACHE_CONTROL
    );
  } catch (error) {
    const { status, body } = toErrorEnvelope(error);
    return jsonResponse(status, body);
  }
};

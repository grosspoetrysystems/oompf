/**
 * `GET /api/v1/mappings/providers` — curated provider identities and links.
 *
 * Canonical, versioned agent route. Returns `{ providers }` where each entry is
 * a curated {@link ProviderLink} (provider id, display name, and canonical
 * public URL). The registry is the single source of truth in `@oompf/core`;
 * unknown providers are never invented and `url` is `null` unless a verified
 * destination is curated. The unversioned `/api/mappings/providers` route
 * re-exports this handler as a compatibility alias.
 */

import { listProviderLinks } from "@oompf/core";
import type { APIRoute } from "astro";

import {
  jsonResponse,
  toErrorEnvelope,
} from "../../../../lib/services/index-profile.ts";

export const prerender = false;

export const GET: APIRoute = () => {
  try {
    return jsonResponse(200, { providers: listProviderLinks() });
  } catch (error) {
    const { status, body } = toErrorEnvelope(error);
    return jsonResponse(status, body);
  }
};

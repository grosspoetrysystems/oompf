/**
 * `GET /api/v1/mappings/models/:provider` — curated model patterns for a
 * provider.
 *
 * Canonical, versioned agent route. Returns `{ provider, models }` where each
 * model is a curated {@link ModelDisplay} (exact selector, friendly name,
 * provider id, canonical URL, alias classification). The registry lives in
 * `@oompf/core`; when the provider is not curated `listProviderModels` returns
 * `null` and this route surfaces a `not_found` error envelope with HTTP 404.
 * Curated models never carry a guessed URL — `url` is `null` when no verified
 * destination exists. The unversioned `/api/mappings/models/:provider` route
 * re-exports this handler as a compatibility alias.
 */

import { listProviderModels } from "@oompf/core";
import type { APIRoute } from "astro";

import {
  IndexError,
  jsonResponse,
  toErrorEnvelope,
} from "../../../../../lib/services/index-profile.ts";

export const prerender = false;

export const GET: APIRoute = ({ params }) => {
  try {
    const provider = (params.provider ?? "").trim();
    if (provider === "") {
      throw new IndexError(
        "invalid_source",
        400,
        "A provider id is required, e.g. /api/v1/mappings/models/anthropic."
      );
    }
    const models = listProviderModels(provider);
    if (models === null) {
      throw new IndexError(
        "not_found",
        404,
        `No curated model mappings for provider "${provider}".`
      );
    }
    return jsonResponse(200, { models, provider });
  } catch (error) {
    const { status, body } = toErrorEnvelope(error);
    return jsonResponse(status, body);
  }
};

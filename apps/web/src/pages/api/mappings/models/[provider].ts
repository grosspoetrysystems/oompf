/**
 * `GET /api/mappings/models/:provider` — compatibility alias for
 * `GET /api/v1/mappings/models/:provider`.
 *
 * The canonical, versioned handler lives at `/api/v1/mappings/models/:provider`.
 * This route re-exports it unchanged so both paths share one implementation and
 * one response contract during the v0 transition.
 */

export { GET, prerender } from "../../v1/mappings/models/[provider].ts";

/**
 * `GET /api/mappings/providers` — compatibility alias for
 * `GET /api/v1/mappings/providers`.
 *
 * The canonical, versioned handler lives at `/api/v1/mappings/providers`. This
 * route re-exports it unchanged so both paths share one implementation and one
 * response contract during the v0 transition.
 */

export { GET, prerender } from "../v1/mappings/providers.ts";

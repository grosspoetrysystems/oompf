/**
 * `GET /api/profiles/:id` — compatibility alias for `GET /api/v1/profiles/:id`.
 *
 * The canonical, versioned handler lives at `/api/v1/profiles/:id`. This route
 * re-exports it unchanged so pre-v1 clients keep working during the v0
 * transition; both paths share one implementation and one response contract.
 */

export { GET, prerender } from "../v1/profiles/[id].ts";

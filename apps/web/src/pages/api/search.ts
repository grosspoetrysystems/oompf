/**
 * `GET /api/search?q=...` — compatibility alias for `GET /api/v1/search`.
 *
 * The canonical, versioned handler lives at `/api/v1/search`. This route
 * re-exports it unchanged so pre-v1 clients keep working during the v0
 * transition; both paths share one implementation and one response contract.
 */

export { GET, prerender } from "./v1/search.ts";

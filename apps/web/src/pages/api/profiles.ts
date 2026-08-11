/**
 * `POST /api/profiles` — compatibility alias for `POST /api/v1/profiles`.
 *
 * The canonical, versioned handler lives at `/api/v1/profiles`. This route
 * re-exports it unchanged so pre-v1 clients keep working during the v0
 * transition; both paths share one implementation and one response contract.
 */

export { POST, prerender } from "./v1/profiles.ts";

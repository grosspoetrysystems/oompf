/**
 * OOMPF metadata/enrichment persistence (Drizzle + Postgres).
 *
 * Worker-safe: this package must avoid CLI-only `child_process`/`gh` usage so
 * it can run inside Cloudflare Workers alongside the Astro web app.
 */
import { VERSION } from "@oompf/core";

/** Marker exposing the shared workspace version this package was built against. */
export const DATABASE_PACKAGE_VERSION = VERSION;

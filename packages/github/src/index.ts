/**
 * GitHub source integration for OOMPF.
 *
 * This package hosts CLI-side `gh`/`child_process` publishing and Worker-safe
 * fetch helpers; CLI-only integration must never be imported by Worker code.
 */
import { VERSION } from "@oompf/core";

/** Marker exposing the shared workspace version this package was built against. */
export const GITHUB_PACKAGE_VERSION = VERSION;

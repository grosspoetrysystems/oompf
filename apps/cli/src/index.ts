#!/usr/bin/env bun
/**
 * OOMPF CLI entrypoint (binary name: `oompf`).
 *
 * Scaffold only: wires the shared domain packages so workspace resolution is
 * exercised. Command definitions (Incur + `gh`) are added in later tasks.
 */
import { VERSION } from "@oompf/core";
import { GITHUB_PACKAGE_VERSION } from "@oompf/github";
import { DATABASE_PACKAGE_VERSION } from "@oompf/database";

/** Aggregated version surface, proving cross-package workspace resolution. */
export const cli = {
  version: VERSION,
  github: GITHUB_PACKAGE_VERSION,
  database: DATABASE_PACKAGE_VERSION,
} as const;

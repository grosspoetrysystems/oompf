/**
 * Zod output schemas and shared output helpers for the OOMPF CLI.
 *
 * Incur renders a command's returned value with these schemas: concise
 * key/value (TOON) output for humans and stable JSON under `--json`. Keeping
 * the schemas here keeps command files focused on orchestration, and keeps the
 * machine-readable contract in one place. No schema carries artifact content or
 * secret values — only displayable metadata.
 */

import { z } from "incur";

/** Shared CLI-level environment: the configurable web endpoint. */
export const cliEnv = z.object({
  OOMPF_BASE_URL: z
    .string()
    .default("https://oompf.ai")
    .describe("Base URL of the OOMPF web API"),
});

/** `publish` result: where the profile now lives and how to install it. */
export const publishOutput = z.object({
  profile: z.string().describe("Local OMP profile that was published"),
  githubUrl: z.string().describe("Public Gist URL on GitHub"),
  oompfUrl: z.string().describe("Canonical OOMPF profile URL"),
  gistId: z.string(),
  revision: z.string().nullable().describe("Pinned Gist revision, when known"),
  hash: z.string().describe("SHA-256 of the published artifact"),
  structural: z.enum(["valid", "invalid"]),
  warnings: z.array(z.string()),
  addCommand: z.string().describe("Copyable command to install this profile"),
});

/** `add` result: the installed profile and how to run it. */
export const addOutput = z.object({
  name: z.string().describe("Local OMP profile name installed"),
  path: z.string().describe("Config file written"),
  source: z.string().describe("Resolved canonical source"),
  revision: z.string().nullable(),
  hash: z.string().describe("SHA-256 of the installed artifact"),
  command: z.string().describe("Command to run OMP with this profile"),
  warnings: z.array(z.string()),
});

/** `inspect` result: metadata only — never artifact content. */
export const inspectOutput = z.object({
  source: z.string(),
  sourceType: z.enum(["gist", "oompf"]),
  name: z.string(),
  owner: z.string().nullable(),
  revision: z.string().nullable(),
  hash: z.string(),
  structural: z.enum(["valid", "invalid"]),
  errors: z.array(z.string()),
  warnings: z.array(z.string()),
  models: z.array(z.string()),
  providers: z.array(z.string()),
  ompVersion: z.string().nullable(),
  installCommand: z.string(),
});

/** A single compact record in `search` output. */
export const searchResult = z.object({
  id: z.string(),
  name: z.string(),
  owner: z.string().nullable(),
  source: z.string(),
  revision: z.string().nullable(),
  structural: z.enum(["valid", "invalid"]),
  models: z.array(z.string()),
  providers: z.array(z.string()),
  url: z.string(),
  updatedAt: z.string(),
});

/** `search` result: the query plus its compact matches. */
export const searchOutput = z.object({
  query: z.string(),
  count: z.number(),
  results: z.array(searchResult),
});

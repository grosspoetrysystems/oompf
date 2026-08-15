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
    .default("https://oompf.run")
    .describe("Base URL of the OOMPF web API"),
});

/** Publisher-curated `oompf` metadata surfaced by publish/inspect. */
export const profileMetadataOutput = z.object({
  kind: z
    .object({ controlled: z.boolean(), value: z.string() })
    .nullable()
    .describe("Profile kind; controlled=true when a known vocabulary term"),
  links: z.array(z.object({ label: z.string().nullable(), url: z.string() })),
  summary: z.string().nullable(),
  tags: z.array(z.string()),
});

/** `publish` result: where the profile now lives and how to install it. */
export const publishOutput = z.object({
  addCommand: z.string().describe("Copyable command to install this profile"),
  aliases: z.array(z.string()).describe("Named model aliases (@-prefixed)"),
  gistId: z.string(),
  githubUrl: z.string().describe("Public Gist URL on GitHub"),
  hash: z.string().describe("SHA-256 of the published artifact"),
  metadata: profileMetadataOutput,
  oompfUrl: z.string().describe("Canonical OOMPF profile URL"),
  profile: z.string().describe("Local OMP profile that was published"),
  revision: z.string().nullable().describe("Pinned Gist revision, when known"),
  structural: z.enum(["valid", "invalid"]),
  warnings: z.array(z.string()),
});

/** A single machine-local prerequisite the installed profile needs. */
const prerequisite = z.object({
  kind: z.enum(["provider", "environment", "project-overlay", "extension"]),
  name: z.string(),
  reason: z.string(),
});

/** `add` result: the installed profile and how to run it. */
export const addOutput = z.object({
  command: z.string().describe("Command to run OMP with this profile"),
  hash: z.string().describe("SHA-256 of the installed artifact"),
  name: z.string().describe("Local OMP profile name installed"),
  path: z.string().describe("Config file written"),
  prerequisites: z
    .array(prerequisite)
    .optional()
    .describe(
      "Profiles' machine-local prerequisites (names and kinds only, never secret values); informational, install succeeds regardless"
    ),
  revision: z.string().nullable(),
  source: z.string().describe("Resolved canonical source"),
  warnings: z.array(z.string()),
});

/** `inspect` result: metadata only — never artifact content. */
export const inspectOutput = z.object({
  aliases: z.array(z.string()).describe("Named model aliases (@-prefixed)"),
  errors: z.array(z.string()),
  hash: z.string(),
  installCommand: z.string(),
  metadata: profileMetadataOutput,
  models: z.array(z.string()),
  name: z.string(),
  ompVersion: z.string().nullable(),
  owner: z.string().nullable(),
  providers: z.array(z.string()),
  revision: z.string().nullable(),
  source: z.string(),
  sourceType: z.enum(["gist", "oompf"]),
  structural: z.enum(["valid", "invalid"]),
  warnings: z.array(z.string()),
});

/** A single compact record in `search` output. */
export const searchResult = z.object({
  id: z.string(),
  models: z.array(z.string()),
  name: z.string(),
  owner: z.string().nullable(),
  providers: z.array(z.string()),
  revision: z.string().nullable(),
  source: z.string(),
  structural: z.enum(["valid", "invalid"]),
  updatedAt: z.string(),
  url: z.string(),
});

/** `search` result: the query plus its compact matches. */
export const searchOutput = z.object({
  count: z.number(),
  query: z.string(),
  results: z.array(searchResult),
});

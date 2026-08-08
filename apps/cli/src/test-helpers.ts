/**
 * Shared fakes and a `serve` driver for the focused CLI command tests.
 *
 * Not a test suite itself (no `.test.ts` suffix). Every seam here is an
 * in-memory fake so command tests never spawn `gh`/`omp`, touch the network, or
 * write to the real filesystem.
 */

import type { CommandRunner } from "@oompf/github";

import { createCli } from "./index.ts";
import type { CliDeps, FsSeam, HttpFetch, HttpResponse } from "./deps.ts";

/** Deterministic fixtures reused across the command tests. */
export const OWNER = "octocat";
export const STEM = "work";
export const GIST_ID = "0123456789abcdef0123456789abcdef";
export const GIST_HTML = `https://gist.github.com/${OWNER}/${GIST_ID}`;
export const REVISION = "abcabcabcabcabcabcabcabcabcabcabcabcabca";
export const PROFILE_ID = "prof_0123456789abcdef0123456789abcdef";
export const BASE_URL = "https://oompf.test";
export const OOMPF_URL = `${BASE_URL}/p/${PROFILE_ID}`;
export const CONTENT = [
  "symbolPreset: default",
  "setupVersion: 7",
  "modelRoles:",
  "  chat: anthropic/claude-x",
  "",
].join("\n");

/** Build a `{ ok, status, text }` HTTP-style response over a text body. */
export function jsonResponse(status: number, body: unknown): HttpResponse {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => (typeof body === "string" ? body : JSON.stringify(body)),
  };
}

/** A public-Gist API metadata body with a single inline `work.yml` file. */
export function gistMetadataBody(content = CONTENT): string {
  return JSON.stringify({
    owner: { login: OWNER },
    html_url: GIST_HTML,
    history: [{ version: REVISION }],
    files: {
      "work.yml": { filename: "work.yml", raw_url: null, content },
    },
  });
}

/** A `fetch` seam that serves the fixture Gist metadata for any api.github.com URL. */
export function gistFetch(content = CONTENT) {
  return async (url: string): Promise<HttpResponse> => {
    if (url.startsWith("https://api.github.com/gists/")) {
      return jsonResponse(200, gistMetadataBody(content));
    }
    return jsonResponse(404, "not found");
  };
}

/** A `gh` command runner returning a successful auth + Gist creation. */
export function ghRunner(
  overrides: Partial<{ authExit: number; gistUrl: string }> = {},
): CommandRunner {
  const { authExit = 0, gistUrl = GIST_HTML } = overrides;
  return async ({ args }) => {
    if (args[0] === "api" && args[1] === "user") {
      return authExit === 0
        ? { stdout: JSON.stringify({ login: OWNER }), stderr: "", exitCode: 0 }
        : { stdout: "", stderr: "gh: not authenticated", exitCode: authExit };
    }
    if (args[0] === "gist" && args[1] === "create") {
      return { stdout: `${gistUrl}\n`, stderr: "", exitCode: 0 };
    }
    return { stdout: "", stderr: "unexpected command", exitCode: 1 };
  };
}

/** An in-memory filesystem seam plus the calls it recorded. */
export function memoryFs(seed: Record<string, string> = {}) {
  const files = new Map<string, string>(Object.entries(seed));
  const dirs = new Set<string>();
  const writes: Array<{ path: string; data: string; mode: number }> = [];
  const fs: FsSeam = {
    readFile: async (path) => {
      const value = files.get(path);
      if (value === undefined) throw new Error(`ENOENT: ${path}`);
      return value;
    },
    writeFile: async (path, data, mode) => {
      writes.push({ path, data, mode });
      files.set(path, data);
    },
    mkdir: async (path) => {
      dirs.add(path);
    },
    exists: async (path) => files.has(path) || dirs.has(path),
  };
  return { fs, files, dirs, writes };
}

/** A register/search/metadata HTTP seam over route→response handlers. */
export function apiFetch(
  routes: Partial<{
    register: (body: string) => HttpResponse;
    metadata: HttpResponse;
    search: HttpResponse;
  }> = {},
): HttpFetch {
  return async (url, init) => {
    const method = init?.method ?? "GET";
    if (url.endsWith("/api/profiles") && method === "POST") {
      return (
        routes.register?.(init?.body ?? "") ??
        jsonResponse(200, {
          id: PROFILE_ID,
          url: `/p/${PROFILE_ID}`,
          source: GIST_HTML,
          validation: {
            level: "structural",
            structural: "valid",
            errors: [],
            warnings: [],
          },
        })
      );
    }
    if (url.includes("/api/profiles/") && method === "GET") {
      return routes.metadata ?? jsonResponse(200, profileRecord());
    }
    if (url.includes("/api/search") && method === "GET") {
      return (
        routes.search ??
        jsonResponse(200, { query: "", results: [compactProfile()] })
      );
    }
    return jsonResponse(404, "not found");
  };
}

/** A full-enough persisted profile record for metadata responses. */
export function profileRecord(): Record<string, unknown> {
  return {
    id: PROFILE_ID,
    sourceType: "gist",
    sourceUrl: GIST_HTML,
    gistId: GIST_ID,
    owner: OWNER,
    profileName: STEM,
    ompVersion: "7",
    revision: REVISION,
    contentHash: "f".repeat(64),
    facts: { models: ["anthropic/claude-x"], providers: ["anthropic"] },
    validation: { structural: "valid", errors: [], warnings: [] },
    createdAt: "2026-08-08T00:00:00.000Z",
    updatedAt: "2026-08-08T00:00:00.000Z",
  };
}

/** A compact search-result row. */
export function compactProfile(): Record<string, unknown> {
  return {
    id: PROFILE_ID,
    url: `/p/${PROFILE_ID}`,
    name: STEM,
    owner: OWNER,
    source: GIST_HTML,
    ompVersion: "7",
    structural: "valid",
    models: ["anthropic/claude-x"],
    providers: ["anthropic"],
    revision: REVISION,
    updatedAt: "2026-08-08T00:00:00.000Z",
  };
}

/** Run the CLI in-process, capturing stdout and the exit code. */
export async function runCli(
  deps: CliDeps,
  argv: string[],
  env: Record<string, string | undefined> = {},
): Promise<{ out: string; code: number | undefined }> {
  let out = "";
  let code: number | undefined;
  await createCli(deps).serve(argv, {
    stdout: (s) => {
      out += s;
    },
    exit: (c) => {
      code = c;
    },
    env: { OOMPF_BASE_URL: BASE_URL, ...env },
  });
  return { out, code };
}

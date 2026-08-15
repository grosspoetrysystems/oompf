/**
 * Shared fakes and a `serve` driver for the focused CLI command tests.
 *
 * Not a test suite itself (no `.test.ts` suffix). Every seam here is an
 * in-memory fake so command tests never spawn `gh`/`omp`, touch the network, or
 * write to the real filesystem.
 */

import { sha256 } from "@oompf/core";
import type { CommandRunner } from "@oompf/github";
import type { CliDeps, FsSeam, HttpFetch, HttpResponse } from "./deps.ts";
import { createCli } from "./index.ts";

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
    files: {
      "work.yml": { content, filename: "work.yml", raw_url: null },
    },
    history: [{ version: REVISION }],
    html_url: GIST_HTML,
    owner: { login: OWNER },
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
  overrides: Partial<{ authExit: number; gistUrl: string }> = {}
): CommandRunner {
  const { authExit = 0, gistUrl = GIST_HTML } = overrides;
  return async ({ args }) => {
    if (args[0] === "api" && args[1] === "user") {
      return authExit === 0
        ? { exitCode: 0, stderr: "", stdout: JSON.stringify({ login: OWNER }) }
        : { exitCode: authExit, stderr: "gh: not authenticated", stdout: "" };
    }
    if (args[0] === "gist" && args[1] === "create") {
      return { exitCode: 0, stderr: "", stdout: `${gistUrl}\n` };
    }
    return { exitCode: 1, stderr: "unexpected command", stdout: "" };
  };
}

/** An in-memory filesystem seam plus the calls it recorded. */
export function memoryFs(seed: Record<string, string> = {}) {
  const files = new Map<string, string>(Object.entries(seed));
  const dirs = new Set<string>();
  const writes: Array<{ path: string; data: string; mode: number }> = [];
  const fs: FsSeam = {
    exists: async (path) => files.has(path) || dirs.has(path),
    mkdir: async (path) => {
      dirs.add(path);
    },
    readFile: async (path) => {
      const value = files.get(path);
      if (value === undefined) {
        throw new Error(`ENOENT: ${path}`);
      }
      return value;
    },
    writeFile: async (path, data, mode) => {
      writes.push({ data, mode, path });
      files.set(path, data);
    },
  };
  return { dirs, files, fs, writes };
}

/** A register/search/metadata HTTP seam over route→response handlers. */
export function apiFetch(
  routes: Partial<{
    register: (body: string) => HttpResponse;
    metadata: HttpResponse;
    search: HttpResponse;
  }> = {}
): HttpFetch {
  return async (url, init) => {
    const method = init?.method ?? "GET";
    if (
      (url.endsWith("/api/profiles") || url.endsWith("/api/v1/profiles")) &&
      method === "POST"
    ) {
      return (
        routes.register?.(init?.body ?? "") ??
        jsonResponse(200, {
          id: PROFILE_ID,
          source: GIST_HTML,
          url: `/p/${PROFILE_ID}`,
          validation: {
            errors: [],
            level: "structural",
            structural: "valid",
            warnings: [],
          },
        })
      );
    }
    if (
      (url.includes("/api/profiles/") || url.includes("/api/v1/profiles/")) &&
      method === "GET"
    ) {
      return routes.metadata ?? jsonResponse(200, profileRecord());
    }
    if (
      (url.includes("/api/search") || url.includes("/api/v1/search")) &&
      method === "GET"
    ) {
      return (
        routes.search ??
        jsonResponse(200, {
          nextCursor: null,
          query: "",
          results: [compactProfile()],
        })
      );
    }
    return jsonResponse(404, "not found");
  };
}

/** A full-enough persisted profile record for metadata responses. */
export function profileRecord(): Record<string, unknown> {
  return {
    contentHash: sha256(CONTENT),
    createdAt: "2026-08-08T00:00:00.000Z",
    facts: {
      aliases: ["@fast"],
      models: ["anthropic/claude-x"],
      providers: ["anthropic"],
    },
    gistId: GIST_ID,
    id: PROFILE_ID,
    metadata: {
      kind: { controlled: false, value: "work" },
      links: [],
      summary: "Daily work profile",
      tags: ["daily"],
    },
    ompVersion: "7",
    owner: OWNER,
    profileName: STEM,
    revision: REVISION,
    sourceType: "gist",
    sourceUrl: GIST_HTML,
    updatedAt: "2026-08-08T00:00:00.000Z",
    validation: { errors: [], structural: "valid", warnings: [] },
  };
}

/** A compact search-result row. */
export function compactProfile(): Record<string, unknown> {
  return {
    id: PROFILE_ID,
    kind: { controlled: false, value: "work" },
    models: ["anthropic/claude-x"],
    name: STEM,
    ompVersion: "7",
    owner: OWNER,
    providers: ["anthropic"],
    revision: REVISION,
    source: GIST_HTML,
    structural: "valid",
    summary: "Daily work profile",
    tags: ["daily"],
    updatedAt: "2026-08-08T00:00:00.000Z",
    url: `/p/${PROFILE_ID}`,
  };
}

/** Run the CLI in-process, capturing stdout and the exit code. */
export async function runCli(
  deps: CliDeps,
  argv: string[],
  env: Record<string, string | undefined> = {}
): Promise<{ out: string; code: number | undefined }> {
  let out = "";
  let code: number | undefined;
  await createCli(deps).serve(argv, {
    env: { OOMPF_BASE_URL: BASE_URL, ...env },
    exit: (c) => {
      code = c;
    },
    stdout: (s) => {
      out += s;
    },
  });
  return { code, out };
}

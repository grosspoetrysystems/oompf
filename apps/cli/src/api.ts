/**
 * Thin client for the OOMPF web API (`register`, `search`, `metadata`).
 *
 * Every failure is mapped to a {@link CommandError} carrying the server's
 * stable error code and value-free message, so command exits stay deterministic
 * and never leak credentials. This module holds no `gh`/Bun-only code, keeping
 * it trivially portable, but it is CLI-only and never imported by the web app.
 */

import type { ProfileRecord } from "@oompf/database";

import { CommandError, type HttpFetch } from "./deps.ts";

/** Response body of `POST /api/profiles`. */
export interface RegisterResponse {
  readonly id: string;
  /** Site-relative profile path, e.g. `/p/<id>`. */
  readonly url: string;
  readonly source: string;
  readonly validation: {
    readonly level: "structural";
    readonly structural: "valid" | "invalid";
    readonly errors: readonly string[];
    readonly warnings: readonly string[];
  };
}

/** A compact profile record as returned by search and listings. */
export interface CompactProfile {
  readonly id: string;
  readonly url: string;
  readonly name: string;
  readonly owner: string | null;
  readonly source: string;
  readonly ompVersion: string | null;
  readonly structural: "valid" | "invalid";
  readonly models: readonly string[];
  readonly providers: readonly string[];
  readonly revision: string | null;
  readonly updatedAt: string;
}

/** Response body of `GET /api/search`. */
export interface SearchResponse {
  readonly query: string;
  readonly results: readonly CompactProfile[];
}

/** Body accepted by {@link registerProfile}. */
export interface RegisterBody {
  readonly source: string;
  readonly ompVersion?: string;
}

/** Join a base URL and an absolute path without doubling slashes. */
function joinUrl(base: string, path: string): string {
  return `${base.replace(/\/+$/, "")}${path.startsWith("/") ? path : `/${path}`}`;
}

/** Build a {@link CommandError} from a non-OK response's JSON error envelope. */
async function envelopeError(
  response: { status: number; text(): Promise<string> },
  fallbackCode: string,
): Promise<CommandError> {
  let code = fallbackCode;
  let message = `The OOMPF API responded with HTTP ${response.status}.`;
  try {
    const parsed = JSON.parse(await response.text()) as {
      error?: { code?: unknown; message?: unknown };
    };
    if (typeof parsed.error?.code === "string" && parsed.error.code.length > 0) {
      code = parsed.error.code;
    }
    if (
      typeof parsed.error?.message === "string" &&
      parsed.error.message.length > 0
    ) {
      message = parsed.error.message;
    }
  } catch {
    // Non-JSON body: keep the status-derived message.
  }
  return new CommandError(code, message);
}

/** Parse a JSON body, or fail with a stable code when it is malformed. */
async function parseJson<T>(
  response: { text(): Promise<string> },
  code: string,
): Promise<T> {
  const text = await response.text();
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new CommandError(
      code,
      "The OOMPF API returned a response that was not valid JSON.",
    );
  }
}

/** Run an HTTP request, mapping transport failures to a stable network error. */
async function request(
  fetchImpl: HttpFetch,
  url: string,
  init: Parameters<HttpFetch>[1],
) {
  try {
    return await fetchImpl(url, init);
  } catch {
    throw new CommandError(
      "network_error",
      `Could not reach the OOMPF API at ${url}.`,
    );
  }
}

/** Register (index) a public source with the OOMPF web API. */
export async function registerProfile(
  baseUrl: string,
  body: RegisterBody,
  fetchImpl: HttpFetch,
): Promise<RegisterResponse> {
  const response = await request(fetchImpl, joinUrl(baseUrl, "/api/profiles"), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw await envelopeError(response, "register_failed");
  return parseJson<RegisterResponse>(response, "register_failed");
}

/** Fetch a single indexed profile's metadata by id. */
export async function fetchProfileMetadata(
  baseUrl: string,
  id: string,
  fetchImpl: HttpFetch,
): Promise<ProfileRecord> {
  const response = await request(
    fetchImpl,
    joinUrl(baseUrl, `/api/profiles/${encodeURIComponent(id)}`),
    { method: "GET" },
  );
  if (!response.ok) throw await envelopeError(response, "not_found");
  return parseJson<ProfileRecord>(response, "not_found");
}

/** Free-text search over the OOMPF index. */
export async function searchProfiles(
  baseUrl: string,
  query: string,
  fetchImpl: HttpFetch,
): Promise<SearchResponse> {
  const url = joinUrl(baseUrl, `/api/search?q=${encodeURIComponent(query)}`);
  const response = await request(fetchImpl, url, { method: "GET" });
  if (!response.ok) throw await envelopeError(response, "search_failed");
  return parseJson<SearchResponse>(response, "search_failed");
}

/** The opaque id scheme the web app derives for each source (see `deriveProfileId`). */
const PROFILE_ID_PATTERN = /^prof_[0-9a-f]{32}$/;

/**
 * Recognize an OOMPF reference (a bare `prof_…` id or any URL whose path ends
 * in `/p/<id>`) and extract its id. Returns `null` for anything else, so the
 * caller can fall back to Gist resolution.
 */
export function parseOompfRef(ref: string): string | null {
  const trimmed = ref.trim();
  if (PROFILE_ID_PATTERN.test(trimmed)) return trimmed;
  const match = trimmed.match(/\/p\/(prof_[0-9a-f]{32})\/?$/);
  return match?.[1] ?? null;
}

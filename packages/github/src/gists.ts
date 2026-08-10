/**
 * Public Gist source resolution for OOMPF.
 *
 * These helpers accept a user-supplied Gist reference, normalize it to a
 * canonical form, and fetch the public profile YAML it points at. Everything
 * here is Worker-safe: it touches only the injectable `fetch` seam and never
 * spawns a process, so it can run inside a Cloudflare Worker as well as the
 * CLI. It also never imports database code — the fetched source content stays
 * a plain value the caller decides what to do with.
 *
 * Only *public* Gists are supported. Private Gists are indistinguishable from
 * a missing Gist over the unauthenticated public API and surface as a
 * not-found error at fetch time.
 */

import { sha256, validateProfileName } from "@oompf/core";

/**
 * A Gist identifier is an opaque hex string. Real Gist IDs are 20–40 lowercase
 * hex characters; we validate the shape so a bare ID can be accepted directly
 * and distinguished from an owner login (which is never pure hex of that
 * length).
 */
const GIST_ID_PATTERN = /^[0-9a-f]{20,40}$/i;

/** A Gist revision is a full 40-character git SHA-1. */
const REVISION_PATTERN = /^[0-9a-f]{40}$/i;

/** YAML file extensions OOMPF recognises for a profile artifact. */
const YAML_EXTENSIONS = [".yml", ".yaml"] as const;

/** Parsed coordinates of a Gist reference. */
export interface GistLocation {
  /** The Gist's opaque hex identifier. */
  readonly gistId: string;
  /** Owner login when the reference carried one, else `null`. */
  readonly owner: string | null;
  /** Pinned revision (git SHA) when the reference carried one, else `null`. */
  readonly revision: string | null;
}

/** Resolved public Gist source: metadata plus the canonical YAML content. */
export interface GistSource {
  /** Exact YAML bytes fetched from the canonical raw URL, as text. */
  readonly content: string;
  /** Lowercase hex SHA-256 of {@link content}. */
  readonly contentHash: string;
  /** Profile YAML filename within the Gist (a validated `<name>.yml`). */
  readonly filename: string;
  /** The Gist's opaque hex identifier. */
  readonly gistId: string;
  /** Browser-facing Gist URL. */
  readonly htmlUrl: string;
  /** Owner login as reported by the API, or `null` for anonymous Gists. */
  readonly owner: string | null;
  /** The revision (git SHA) the content was read from, when known. */
  readonly revision: string | null;
}

/** Minimal structural view of a `fetch` response used by this module. */
export interface GistFetchResponse {
  readonly ok: boolean;
  readonly status: number;
  text(): Promise<string>;
}

/** Injectable `fetch` seam so tests never hit the network. */
export type GistFetch = (
  url: string,
  init?: { readonly headers?: Record<string, string> }
) => Promise<GistFetchResponse>;

/** Options for {@link fetchPublicGist}. */
export interface FetchPublicGistOptions {
  /** `fetch` seam override; defaults to the global `fetch`. */
  readonly fetch?: GistFetch;
}

const bunFetchHolder = globalThis as unknown as { fetch?: GistFetch };

/** Headers every GitHub API request needs (a User-Agent is mandatory). */
const GITHUB_API_HEADERS: Record<string, string> = {
  Accept: "application/vnd.github+json",
  "User-Agent": "oompf",
  "X-GitHub-Api-Version": "2022-11-28",
};

/**
 * Parse a Gist reference into its {@link GistLocation}, or throw with an
 * explanatory reason.
 *
 * Accepted forms:
 *  - a bare Gist ID (`d4e5f6...`)
 *  - `https://gist.github.com/<id>`
 *  - `https://gist.github.com/<owner>/<id>`
 *  - `https://gist.github.com/<owner>/<id>/<revision>`
 *  - `https://gist.github.com/<id>/<revision>`
 *  - `https://api.github.com/gists/<id>[/<revision>]`
 *
 * Any other host (including `github.com` repository URLs) or a reference with
 * no recognisable Gist ID is rejected as unsupported/ambiguous.
 */
export function parseGistLocation(input: string): GistLocation {
  const trimmed = input.trim();
  if (trimmed.length === 0) {
    throw new Error("Gist reference is empty.");
  }

  // Bare Gist ID.
  if (GIST_ID_PATTERN.test(trimmed)) {
    return { gistId: trimmed.toLowerCase(), owner: null, revision: null };
  }

  const urlMatch = trimmed.match(/^https?:\/\/([^/?#]+)\/([^?#]*)/i);
  if (urlMatch === null) {
    throw new Error(
      `Unsupported Gist reference: "${trimmed}". Provide a public Gist URL or ID.`
    );
  }
  const host = (urlMatch[1] ?? "").toLowerCase();
  const segments = (urlMatch[2] ?? "").split("/").filter((s) => s.length > 0);

  if (host === "api.github.com") {
    // /gists/<id>[/<revision>]
    if (segments[0] !== "gists" || segments.length < 2 || segments.length > 3) {
      throw new Error(
        `Unsupported api.github.com Gist reference: "${trimmed}".`
      );
    }
    return finishLocation(
      segments[1] ?? "",
      null,
      segments[2] ?? null,
      trimmed
    );
  }

  if (host === "gist.github.com") {
    return parseGistWebPath(segments, trimmed);
  }

  throw new Error(
    `Unsupported host "${host}" for Gist reference: "${trimmed}". Only gist.github.com and api.github.com are accepted.`
  );
}

/** Resolve owner/id/revision from `gist.github.com` path segments. */
function parseGistWebPath(segments: string[], raw: string): GistLocation {
  if (segments.length === 1) {
    return finishLocation(segments[0] ?? "", null, null, raw);
  }
  if (segments.length === 2) {
    const [first, second] = segments;
    // Disambiguate `<id>/<revision>` from `<owner>/<id>`.
    if (
      GIST_ID_PATTERN.test(first ?? "") &&
      REVISION_PATTERN.test(second ?? "")
    ) {
      return finishLocation(first ?? "", null, second ?? null, raw);
    }
    return finishLocation(second ?? "", first ?? null, null, raw);
  }
  if (segments.length === 3) {
    return finishLocation(
      segments[1] ?? "",
      segments[0] ?? null,
      segments[2] ?? null,
      raw
    );
  }
  throw new Error(
    `Ambiguous Gist reference with too many path segments: "${raw}".`
  );
}

/** Validate the resolved ID and revision, then build a {@link GistLocation}. */
function finishLocation(
  gistId: string,
  owner: string | null,
  revision: string | null,
  raw: string
): GistLocation {
  if (!GIST_ID_PATTERN.test(gistId)) {
    throw new Error(`Could not find a valid Gist ID in reference: "${raw}".`);
  }
  if (revision !== null && !REVISION_PATTERN.test(revision)) {
    throw new Error(
      `Invalid Gist revision "${revision}" in reference: "${raw}".`
    );
  }
  return {
    gistId: gistId.toLowerCase(),
    owner: owner === null || owner.length === 0 ? null : owner,
    revision: revision === null ? null : revision.toLowerCase(),
  };
}

/**
 * Normalize any accepted Gist reference to its canonical browser URL,
 * `https://gist.github.com/<id>`, or throw when the reference is unsupported.
 *
 * Revision and owner are intentionally dropped from the canonical form: two
 * references to the same Gist normalize identically, which is what callers key
 * on. Use {@link fetchPublicGist} when the revision matters.
 */
export function normalizeGistUrl(input: string): string {
  const { gistId } = parseGistLocation(input);
  return `https://gist.github.com/${gistId}`;
}

/** Shape of a single file entry inside a Gist API response. */
interface GistFileEntry {
  /** Inline content the API embedded for small, untruncated files, else `null`. */
  readonly content: string | null;
  readonly filename: string;
  readonly rawUrl: string | null;
}

/**
 * Fetch a public Gist and return its single canonical profile YAML source.
 *
 * The Gist metadata is read from `https://api.github.com/gists/<id>` (pinned
 * to a revision when the reference carried one). Exactly one `.yml`/`.yaml`
 * file whose stem is a valid profile name must be present; zero, multiple, or
 * an unsupported filename is rejected. The file's exact bytes are then read
 * from its canonical `raw_url` and hashed.
 *
 * @throws Error for unsupported references, missing/private Gists (404),
 *   ambiguous or unsupported YAML files, and transport failures.
 */
export async function fetchPublicGist(
  source: string,
  options?: FetchPublicGistOptions
): Promise<GistSource> {
  const location = parseGistLocation(source);
  const doFetch = options?.fetch ?? bunFetchHolder.fetch;
  if (doFetch === undefined) {
    throw new Error(
      "No fetch implementation is available; inject one via options.fetch."
    );
  }

  const apiUrl =
    location.revision === null
      ? `https://api.github.com/gists/${location.gistId}`
      : `https://api.github.com/gists/${location.gistId}/${location.revision}`;

  const metaResponse = await doFetch(apiUrl, { headers: GITHUB_API_HEADERS });
  if (!metaResponse.ok) {
    if (metaResponse.status === 404) {
      throw new Error(
        `Public Gist "${location.gistId}" was not found. It may be private, deleted, or the ID may be wrong.`
      );
    }
    throw new Error(
      `Failed to fetch Gist "${location.gistId}": HTTP ${metaResponse.status}.`
    );
  }

  const meta = parseGistMetadata(await metaResponse.text(), location.gistId);
  const yamlFile = selectYamlFile(meta.files, location.gistId);

  let content: string;
  if (yamlFile.rawUrl !== null) {
    const rawResponse = await doFetch(yamlFile.rawUrl, {
      headers: { "User-Agent": "oompf" },
    });
    if (!rawResponse.ok) {
      throw new Error(
        `Failed to fetch raw content for "${yamlFile.filename}" in Gist "${location.gistId}": HTTP ${rawResponse.status}.`
      );
    }
    content = await rawResponse.text();
  } else if (yamlFile.content === null) {
    throw new Error(
      `Gist "${location.gistId}" file "${yamlFile.filename}" exposed no raw URL or content.`
    );
  } else {
    content = yamlFile.content;
  }

  return {
    content,
    contentHash: sha256(content),
    filename: yamlFile.filename,
    gistId: location.gistId,
    htmlUrl: meta.htmlUrl ?? `https://gist.github.com/${location.gistId}`,
    owner: meta.owner,
    revision: location.revision ?? meta.revision,
  };
}

/** Structured subset of a Gist API response this module consumes. */
interface GistMetadata {
  readonly files: GistFileEntry[];
  readonly htmlUrl: string | null;
  readonly owner: string | null;
  readonly revision: string | null;
}

/** Parse the Gist API JSON body into {@link GistMetadata}. */
function parseGistMetadata(body: string, gistId: string): GistMetadata {
  let json: unknown;
  try {
    json = JSON.parse(body);
  } catch {
    throw new Error(
      `Gist "${gistId}" returned a response that was not valid JSON.`
    );
  }
  if (typeof json !== "object" || json === null) {
    throw new Error(`Gist "${gistId}" returned an unexpected response shape.`);
  }

  let owner: string | null = null;
  if ("owner" in json) {
    const ownerValue = json.owner;
    if (
      typeof ownerValue === "object" &&
      ownerValue !== null &&
      "login" in ownerValue &&
      typeof ownerValue.login === "string"
    ) {
      owner = ownerValue.login;
    }
  }

  let revision: string | null = null;
  if (
    "history" in json &&
    Array.isArray(json.history) &&
    json.history.length > 0
  ) {
    const head: unknown = json.history[0];
    if (
      typeof head === "object" &&
      head !== null &&
      "version" in head &&
      typeof head.version === "string"
    ) {
      revision = head.version;
    }
  }

  let htmlUrl: string | null = null;
  if ("html_url" in json && typeof json.html_url === "string") {
    htmlUrl = json.html_url;
  }

  const files: GistFileEntry[] = [];
  if (
    "files" in json &&
    typeof json.files === "object" &&
    json.files !== null
  ) {
    for (const value of Object.values(json.files)) {
      if (typeof value !== "object" || value === null) {
        continue;
      }
      const filename =
        "filename" in value && typeof value.filename === "string"
          ? value.filename
          : null;
      if (filename === null) {
        continue;
      }
      const rawUrl =
        "raw_url" in value && typeof value.raw_url === "string"
          ? value.raw_url
          : null;
      const content =
        "content" in value && typeof value.content === "string"
          ? value.content
          : null;
      files.push({ content, filename, rawUrl });
    }
  }

  return { files, htmlUrl, owner, revision };
}

/**
 * Choose the single supported profile YAML file from a Gist's files, or throw
 * when there are none, several, or the filename is not a valid profile name.
 */
function selectYamlFile(files: GistFileEntry[], gistId: string): GistFileEntry {
  const yamlFiles = files.filter((file) =>
    YAML_EXTENSIONS.some((ext) => file.filename.toLowerCase().endsWith(ext))
  );
  if (yamlFiles.length === 0) {
    throw new Error(
      `Gist "${gistId}" contains no YAML (.yml/.yaml) profile file.`
    );
  }
  if (yamlFiles.length > 1) {
    const names = yamlFiles.map((file) => file.filename).join(", ");
    throw new Error(
      `Gist "${gistId}" contains multiple YAML files (${names}); the profile source is ambiguous.`
    );
  }
  const file = yamlFiles[0];
  if (file === undefined) {
    throw new Error(`Gist "${gistId}" contains no YAML profile file.`);
  }
  const stem = file.filename.replace(/\.(ya?ml)$/i, "");
  const nameCheck = validateProfileName(stem);
  if (!nameCheck.ok) {
    throw new Error(
      `Gist "${gistId}" file "${file.filename}" is not a supported profile filename: ${nameCheck.reason}`
    );
  }
  return file;
}

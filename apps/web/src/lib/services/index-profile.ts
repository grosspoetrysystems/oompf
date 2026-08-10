/**
 * OOMPF public-Gist indexing service.
 *
 * This is the Worker-safe heart of the web index: it normalizes a submitted
 * source, fetches the canonical profile YAML through `@oompf/github`'s
 * Worker-safe `fetch` seam, validates it structurally with `@oompf/core`,
 * and persists *metadata only* through a `@oompf/database` repository. It
 * never imports the CLI-only `gh`/`child_process` code path (it imports from
 * `@oompf/github/gists`, not the package barrel), so the whole module runs
 * unchanged inside a Cloudflare Worker.
 *
 * The database connection is resolved from the Cloudflare runtime env at the
 * request boundary via {@link resolveRepository}; every unit here accepts an
 * injected {@link ProfileRepository} (and an optional Gist-fetch seam) so
 * tests exercise the flow hermetically, without a network or a database.
 */

import { type ProfileFacts, validateArtifact } from "@oompf/core";
import {
  createNeonDatabase,
  createProfileRepository,
  type ProfileRecord,
  type ProfileRepository,
} from "@oompf/database";
import {
  fetchPublicGist,
  type GistFetch,
  type GistSource,
  normalizeGistUrl,
} from "@oompf/github/gists";

/** Stable machine-readable error codes returned in the JSON error envelope. */
export type IndexErrorCode =
  | "invalid_source"
  | "source_not_found"
  | "ambiguous_source"
  | "source_unreachable"
  | "validation_failed"
  | "blocking_secrets"
  | "not_found"
  | "server_misconfigured"
  | "internal_error";

/**
 * An indexing failure carrying the HTTP status and stable code the API routes
 * surface verbatim. `details` holds actionable, value-free specifics (e.g.
 * structural errors) — never any secret value.
 */
export class IndexError extends Error {
  readonly code: IndexErrorCode;
  readonly status: number;
  readonly details: readonly string[];

  constructor(
    code: IndexErrorCode,
    status: number,
    message: string,
    details: readonly string[] = []
  ) {
    super(message);
    this.name = "IndexError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

/** Extract a displayable message from any thrown value. */
function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Input to {@link indexPublicGist}: a public Gist reference plus optional version. */
export interface IndexProfileInput {
  /** OMP version the publisher declares this profile targets, if any. */
  readonly ompVersion?: string;
  /** A public Gist URL or bare Gist ID. */
  readonly source: string;
}

/** The Gist-fetch seam; defaults to {@link fetchPublicGist}. */
export type FetchPublicGist = (
  source: string,
  options?: { readonly fetch?: GistFetch }
) => Promise<GistSource>;

/** Injectable dependencies for {@link indexPublicGist}. */
export interface IndexProfileDeps {
  /** Gist-fetch override for tests; defaults to the real Worker-safe fetch. */
  readonly fetchGist?: FetchPublicGist;
  /** Metadata persistence surface. */
  readonly repository: ProfileRepository;
}

/** Strip a recognised YAML extension from a Gist filename to get the profile name. */
function profileNameFromFilename(filename: string): string {
  return filename.replace(/\.(ya?ml)$/i, "");
}

/**
 * Map a `@oompf/github` fetch failure to a typed {@link IndexError} with the
 * appropriate HTTP status. The library throws plain `Error`s with stable,
 * user-facing messages; this is the single place that classifies them.
 */
function classifyGistError(error: unknown): IndexError {
  const message = messageOf(error);
  if (/was not found/i.test(message)) {
    return new IndexError("source_not_found", 404, message);
  }
  if (/multiple YAML files|is ambiguous/i.test(message)) {
    return new IndexError("ambiguous_source", 422, message);
  }
  if (/no YAML|not a supported profile filename/i.test(message)) {
    return new IndexError("validation_failed", 422, message);
  }
  if (/Unsupported|reference is empty|Provide a public Gist/i.test(message)) {
    return new IndexError("invalid_source", 400, message);
  }
  // Transport failures, non-404 HTTP errors, malformed API responses.
  return new IndexError("source_unreachable", 502, message);
}

/**
 * Index a public Gist: normalize the source, fetch its canonical YAML, validate
 * it structurally, extract facts, and persist metadata (never content). The
 * returned record is idempotent per canonical source URL — re-indexing an
 * unchanged source returns the existing record untouched.
 *
 * @throws {IndexError} for unsupported/private/ambiguous/unreachable sources
 *   and structurally invalid or secret-bearing artifacts.
 */
export async function indexPublicGist(
  input: IndexProfileInput,
  deps: IndexProfileDeps
): Promise<ProfileRecord> {
  const source = (input.source ?? "").trim();
  if (source === "") {
    throw new IndexError(
      "invalid_source",
      400,
      "Provide a public Gist URL or ID."
    );
  }

  // Normalize up front: this rejects unsupported hosts and unparseable
  // references (repository URLs, other hosts) before any network access, and
  // yields the canonical, revision-free URL the record is keyed on.
  let sourceUrl: string;
  try {
    sourceUrl = normalizeGistUrl(source);
  } catch (error) {
    throw new IndexError("invalid_source", 400, messageOf(error));
  }

  const fetchGist = deps.fetchGist ?? fetchPublicGist;
  let gist: GistSource;
  try {
    gist = await fetchGist(source);
  } catch (error) {
    throw classifyGistError(error);
  }

  // Server-side validation is structural only; label it as such everywhere.
  const validation = validateArtifact({ yaml: gist.content });
  if (validation.structural === "invalid" || validation.facts === null) {
    throw new IndexError(
      "validation_failed",
      422,
      "The Gist is not a structurally valid OMP profile.",
      validation.errors
    );
  }
  if (validation.blocking.length > 0) {
    throw new IndexError(
      "blocking_secrets",
      422,
      "The profile contains high-confidence secrets and was not indexed. Remove them and re-publish.",
      validation.blocking.map((finding) => `${finding.path}: ${finding.reason}`)
    );
  }

  const facts: ProfileFacts = validation.facts;

  return deps.repository.createOrUpdateProfile({
    contentHash: gist.contentHash,
    facts,
    gistId: gist.gistId,
    // Preserve the publisher-declared OMP version when supplied.
    ompVersion: input.ompVersion ?? null,
    owner: gist.owner,
    profileName: profileNameFromFilename(gist.filename),
    revision: gist.revision,
    sourceType: "gist",
    sourceUrl,
    validation,
  });
}

/** Cloudflare runtime environment surface consumed by the web app. */
export interface RuntimeEnv {
  /** Postgres connection string for the metadata index (Neon serverless). */
  readonly DATABASE_URL?: string;
}

/**
 * The subset of `Astro.locals` the routes rely on. In production only
 * `runtime.env` is present (populated by the Cloudflare adapter); tests inject
 * `repository`/`fetchGist` seams so no real database or network is touched.
 */
export interface AppLocals {
  /** Test seam: a Gist-fetch override threaded into {@link indexPublicGist}. */
  fetchGist?: FetchPublicGist;
  /** Test seam: a pre-built repository, bypassing env-based construction. */
  repository?: ProfileRepository;
  runtime?: { env?: RuntimeEnv };
}

/**
 * Resolve the profile repository for a request. Prefers an injected test
 * repository; otherwise builds a Worker-compatible Neon-backed repository from
 * `DATABASE_URL`. Throws a `server_misconfigured` {@link IndexError} when no
 * binding is available so the routes return a clean 500 envelope.
 */
export async function resolveRepository(
  locals: AppLocals
): Promise<ProfileRepository> {
  if (locals.repository) {
    return locals.repository;
  }
  let url = locals.runtime?.env?.DATABASE_URL;
  if (url === undefined) {
    try {
      const workerModule = (await import("cloudflare:workers")) as {
        env?: { DATABASE_URL?: string };
      };
      url = workerModule.env?.DATABASE_URL;
    } catch {
      // The virtual Worker module is unavailable in local Node/Bun execution.
    }
  }
  if (url === undefined || url.trim() === "") {
    throw new IndexError(
      "server_misconfigured",
      500,
      "The profile index database is not configured."
    );
  }
  return createProfileRepository(createNeonDatabase(url));
}

/** The `/p/<id>` path for a profile id. */
export function profilePath(id: string): string {
  return `/p/${id}`;
}

/** JSON returned by `POST /api/profiles`. */
export interface RegisterResponse {
  readonly id: string;
  readonly source: string;
  readonly url: string;
  readonly validation: {
    /** Server validation is always structural in v0. */
    readonly level: "structural";
    readonly structural: "valid" | "invalid";
    readonly errors: readonly string[];
    readonly warnings: readonly string[];
  };
}

/** Shape a persisted record into the registration response. */
export function toRegisterResponse(record: ProfileRecord): RegisterResponse {
  return {
    id: record.id,
    source: record.sourceUrl,
    url: profilePath(record.id),
    validation: {
      errors: [...record.validation.errors],
      level: "structural",
      structural: record.validation.structural,
      warnings: [...record.validation.warnings],
    },
  };
}

/** A compact profile record for search results and index listings. */
export interface CompactProfile {
  readonly id: string;
  readonly models: readonly string[];
  readonly name: string;
  readonly ompVersion: string | null;
  readonly owner: string | null;
  readonly providers: readonly string[];
  readonly revision: string | null;
  readonly source: string;
  readonly structural: "valid" | "invalid";
  readonly updatedAt: string;
  readonly url: string;
}

/** Normalize a possibly-`Date` timestamp to an ISO string. */
function isoTimestamp(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : value;
}

/** Project a persisted record to its compact, metadata-only view. */
export function toCompactProfile(record: ProfileRecord): CompactProfile {
  return {
    id: record.id,
    models: [...record.facts.models],
    name: record.profileName,
    ompVersion: record.ompVersion,
    owner: record.owner,
    providers: [...record.facts.providers],
    revision: record.revision,
    source: record.sourceUrl,
    structural: record.validation.structural,
    updatedAt: isoTimestamp(record.updatedAt),
    url: profilePath(record.id),
  };
}

/** Free-text search over the index, returning compact records. */
export async function searchIndexedProfiles(
  repository: ProfileRepository,
  query: string
): Promise<CompactProfile[]> {
  const records = await repository.searchProfiles(query);
  return records.map(toCompactProfile);
}

/**
 * A broad term every indexed source URL contains, used to surface a sample of
 * the index on the home page. v0's repository exposes no dedicated recency
 * listing, so featured profiles reuse the search seam over the shared source
 * host; a dedicated `listRecent` is a follow-up once the schema grows one.
 */
const FEATURED_QUERY = "gist.github.com";

/** Surface a capped sample of indexed profiles for the home page. */
export async function listFeaturedProfiles(
  repository: ProfileRepository,
  limit = 12
): Promise<CompactProfile[]> {
  const records = await repository.searchProfiles(FEATURED_QUERY);
  return records.slice(0, limit).map(toCompactProfile);
}

/** Fetch a single profile's metadata, or throw a `not_found` {@link IndexError}. */
export async function getProfileMetadata(
  repository: ProfileRepository,
  id: string
): Promise<ProfileRecord> {
  const record = id.trim() === "" ? null : await repository.getProfile(id);
  if (record === null) {
    throw new IndexError(
      "not_found",
      404,
      `No indexed profile with id "${id}".`
    );
  }
  return record;
}

/** Parse and validate a `POST /api/profiles` JSON body. */
export async function parseRegisterBody(request: {
  json(): Promise<unknown>;
}): Promise<IndexProfileInput> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw new IndexError(
      "invalid_source",
      400,
      "Request body must be JSON with a `source` field."
    );
  }
  if (
    typeof body !== "object" ||
    body === null ||
    !("source" in body) ||
    typeof (body as { source: unknown }).source !== "string"
  ) {
    throw new IndexError(
      "invalid_source",
      400,
      "Request body must include a `source` string (a public Gist URL or ID)."
    );
  }
  const record = body as { source: string; ompVersion?: unknown };
  const ompVersion =
    typeof record.ompVersion === "string" && record.ompVersion.trim() !== ""
      ? record.ompVersion.trim()
      : undefined;
  return { ompVersion, source: record.source };
}

/** The stable JSON error envelope shape. */
export interface ErrorEnvelope {
  readonly error: {
    readonly code: string;
    readonly message: string;
    readonly details?: readonly string[];
  };
}

/** Map any thrown value to an HTTP status and error envelope body. */
export function toErrorEnvelope(error: unknown): {
  status: number;
  body: ErrorEnvelope;
} {
  if (error instanceof IndexError) {
    return {
      body: {
        error: {
          code: error.code,
          message: error.message,
          ...(error.details.length > 0 ? { details: [...error.details] } : {}),
        },
      },
      status: error.status,
    };
  }
  return {
    body: {
      error: {
        code: "internal_error",
        message: "An unexpected error occurred.",
      },
    },
    status: 500,
  };
}

/** Build a JSON `Response` with the given status. */
export function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json; charset=utf-8" },
    status,
  });
}

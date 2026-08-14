# OOMPF architecture

OOMPF (Open OMP Format) is an open index for sharing OMP (Oh My Pi) agent
profiles. Live at [oompf.run](https://oompf.run). It publishes, indexes,
inspects, searches, and installs OMP profiles while keeping the canonical
artifact at its original source.

This document explains the system to a new maintainer. For the developer
workflow (scripts, tests, migrations, commits), see
[CONTRIBUTING.md](../CONTRIBUTING.md).

## End-to-end data flow

```text
  author writes a local OMP profile (config.yml)
        │
        │  oompf publish <profile>
        ▼
  validated + secret-scanned by @oompf/core ── high-confidence secrets abort
        │
        │  create public one-file Gist via `gh` (@oompf/github)
        ▼
  public Gist on gist.github.com   ◄── the CANONICAL artifact
        │
        │  POST /api/v1/profiles (source = Gist URL)
        ▼
  Worker fetches the Gist raw YAML (Worker-safe fetch seam)
        │
        │  normalize → validate → extract facts (@oompf/core)
        │  persist METADATA ONLY (@oompf/database → Neon)
        ▼
  profile row keyed by prof_<id>, indexed        https://oompf.run/p/<id>
        │
        │  inspect https://oompf.run/p/<id>  (GET /api/v1/profiles/:id)
        │  search ?q=...                (GET /api/v1/search)
        ▼
  oompf add https://oompf.run/p/<id>
        │
        │  resolve the source Gist, validate, resolve install dir via `omp`
        │  refuse if the target already exists (no overwrite)
        ▼
  native OMP profile installed on disk
        │
        ▼
  omp --profile <name>
```

Key property: the only place the canonical profile YAML ever lives is the
public Gist. Everything on the OOMPF side is derived.

## Workspace layout and boundaries

Monorepo (Bun workspaces, orchestrated by Turbo):

```text
apps/cli          published CLI (npm package `@grosspoetrysystems/oompf`, v0.1.0)
apps/web          Astro site + Cloudflare Worker (API and docs)
packages/core     OMP discovery, YAML parsing, validation, facts, metadata,
                  provider links, spawnCapture
packages/github   `gh` CLI integration + Worker-safe Gist fetching
packages/database Drizzle schema, migrations, repository
scripts           local wrappers + smoke tooling
```

### Why the boundaries are where they are

- **`packages/core` exposes a Worker-safe, runtime-agnostic surface.** The pure
  logic — YAML parsing, structural validation, secret scanning, fact/metadata
  extraction, provider links, hashing, profile-name rules — depends only on
  `yaml` and standard promises. `parseProfileYaml` explicitly does not rely on
  `Bun.YAML` (there is a portability test that deletes the `Bun.YAML` global and
  still parses), so this surface runs unchanged inside a Cloudflare Worker and
  in the Bun/Node CLI. The only Node-only code — process spawning
  (`spawn.ts`, which documents why it uses `node:child_process` so it also runs
  on Node) and on-disk profile discovery (`omp-profile.ts`, `node:fs`) — is
  isolated and is never in the import graph of the web index path, which pulls
  only the pure extraction modules.

- **`packages/github` splits into two halves with different portability.** The
  fetch helpers (`gists.ts`) are Worker-safe: they touch only the injectable
  `fetch` seam and never spawn a process, so the web Worker can fetch a public
  Gist. The publish path (`gh.ts`) shells out to the `gh` CLI to create a Gist,
  so it is **CLI-only** and must never be imported by Worker code. The Worker
  avoids pulling it in by importing the Worker-safe half from the
  `@oompf/github/gists` subpath rather than the package barrel, which re-exports
  both halves.

- **`packages/database` is server-only.** It owns the Drizzle schema, the
  migrations, and the repository abstraction. The schema uses
  `drizzle-orm/pg-core` (a pure schema builder) so the *schema module* runs in a
  Worker, but the repository deliberately leaves the driver injection to the
  caller — `createNeonDatabase` uses `@neondatabase/serverless` for the Worker,
  while tests pass a PGlite-backed database. Nothing here is importable by the
  CLI as a runtime dependency.

- **`apps/cli` wraps core + github with injectable seams** (below) and an Incur
  router exposing `publish`, `add`, `inspect`, `search`. Its workspace
  dependencies are bundled into the published binary by `tsdown` (`noExternal`),
  so a consumer resolves no workspace packages at runtime.

## Trust and provenance model

OOMPF deliberately stores derived metadata, never the source. The trust chain:

- **Canonical source of truth = the public Gist.** The profile YAML a user
  installs is fetched from the Gist, not from OOMPF. OOMPF is a pointer, not a
  mirror.
- **`contentHash`** is the SHA-256 of the exact canonical UTF-8 bytes, computed
  by `@oompf/core` (`sha256`). It lets a consumer (or the install path) verify
  that what they hold matches what was indexed.
- **`revision`** is the Gist's git SHA (a 40-hex commit) the content was read
  from, when GitHub reports one. It pins *which* version of the source was
  indexed, complementing the content hash.
- **`id`** is stable and derived deterministically from the canonical source URL
  (`prof_<hash>`), so re-registering the same Gist always resolves to the same
  row — the index is idempotent per canonical source.
- Rows are keyed on the *revision-free* canonical URL
  (`https://gist.github.com/<id>`): two references to the same Gist normalize
  identically regardless of owner/revision. Re-registering unchanged content
  returns the existing row untouched (no write, `updatedAt` preserved); a
  changed revision/content refreshes metadata while preserving `createdAt`.

Because only metadata is persisted, a compromise of the index leaks facts but
not profile secrets — and high-confidence secrets are blocked at publish and
index time before they ever reach the pipeline.

## The seam pattern

Every surface that touches the outside world — filesystem, `gh`, `omp`, HTTP,
Gist fetching — is an injected dependency. Commands and the index service never
touch these resources directly:

- CLI commands take a `CliDeps` bundle (`apps/cli/src/deps.ts`): `fs` (exists /
  mkdir / readFile / writeFile), `gistFetch`, `httpFetch`, `runner` (the `gh`
  command runner), `ghCommand`/`ompCommand`, plus the profile resolvers
  (`discoverProfiles`, `resolveProfileConfig`, `resolveInstallTarget`).
- The web index service takes `IndexProfileDeps` (`index-profile.ts`): a
  `repository` (required, a `ProfileRepository`) and an optional `fetchGist`
  seam defaulting to the real Worker-safe fetch.

Tests inject fakes for all of these, so every unit and the full `smoke:local`
flow (CLI → index service → PGlite repository) runs hermetically — no network,
no real `gh`/`omp`, no real database. The real implementations are wired only at
the boundaries:

- `resolveDeps` in `deps.ts` wires `defaultFs` (`node:fs/promises`), the global
  `fetch` for HTTP and Gist fetch, and the real `@oompf/core` resolvers.
- `resolveRepository` in `index-profile.ts` builds a Neon-backed repository from
  `cloudflare:workers` env `DATABASE_URL`; when absent it throws
  `server_misconfigured` so routes return a clean 500 rather than crash.

## Deployment topology

```text
  Astro (server output) ──> Cloudflare Worker "oompf-web"
      ├── /, /p/<id>, /search, /docs, /openapi.json, /llms.txt
      └── /api/v1/*  (canonical)  +  /api/*  (compatibility aliases)
              │  @neondatabase/serverless driver
              ▼
        Neon Postgres (DATABASE_URL)
```

- **Runtime:** `apps/web` is an Astro app built with `@astrojs/cloudflare` in
  server (SSR) output and deployed to Cloudflare Workers by
  [`deploy.yml`](../.github/workflows/deploy.yml). `bun run preview` runs it
  locally via `wrangler dev`.
- **Database:** Neon Postgres via `@neondatabase/serverless`, reached through a
  Worker-compatible driver (never a Node TCP socket). Migrations live in
  `packages/database/migrations` and are applied in the deploy job with
  `bun run db:migrate` *after* CI passes and *before* the Worker deploy; the
  Worker receives `DATABASE_URL` as a Cloudflare secret.
- **Deploy gating:** `deploy.yml` triggers on a successful CI run against
  `main` (or manual dispatch on `main`). It re-runs the checks, applies
  migrations, then deploys. If `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`,
  or `DATABASE_URL` are absent as repository secrets the deploy step skips
  rather than failing.
- **API versioning:** agent routes are canonical under `/api/v1/*`; the
  pre-v1 `/api/*` paths are thin compatibility aliases that re-export the same
  handlers and contracts during the v0 transition. The reference contract is
  `/openapi.json`; agent indexes ship at `/llms.txt` and `/docs/llms.txt`.

## Sharp edges for maintainers

- **Stored `facts` are not re-extracted on unchanged re-registration.** A row
  is created/updated with the facts computed at index time. Because
  `createOrUpdateProfile` is idempotent per unchanged `contentHash` (it does
  not write at all), registering the same unchanged source never calls the
  fact extractor again. **Adding fields to `extractFacts`/the schema does not
  backfill existing rows** — existing profiles keep facts computed by the old
  extractor until their source content actually changes. A backfill migration
  is a deliberate, separate step.

- **`listFeaturedProfiles` lists recent profiles.** The home page's "featured"
  listing is now `repository.listRecent(limit)` — newest by `updatedAt`, capped
  at the SQL layer — instead of the former `FEATURED_QUERY` substring search
  over `source_url`. A blank search query routes to the same recent listing, so
  an empty query surfaces the index instead of returning nothing.

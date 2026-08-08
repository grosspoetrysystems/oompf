# OOMPF v0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Bun/TypeScript OOMPF CLI and Astro/Cloudflare web index that publishes native OMP profile YAML to public GitHub Gists, indexes it, and installs it as a native OMP profile.

**Architecture:** A Bun workspace contains `apps/cli`, `apps/web`, and shared `packages/core`, `packages/github`, and `packages/database` packages. The CLI uses Incur and `gh`; the web app uses Astro endpoints/pages on Cloudflare Workers; Postgres stores only source metadata and enrichment through Drizzle. GitHub remains the canonical artifact host and OMP remains the execution runtime.

**Tech Stack:** Bun, TypeScript, Incur, Zod, YAML parser, Astro, Cloudflare Workers/Wrangler, Drizzle ORM, Postgres, GitHub Gists, `gh` CLI, GitHub Actions.

## Global Constraints

- GitHub Gists are the only v0 publishing source.
- The canonical artifact is one native OMP YAML file; do not define a replacement profile schema.
- Never publish credentials, auth-broker state, databases, caches, logs, sessions, `.env` files, project overlays, or machine-local hooks/extensions.
- Resolve OMP paths through `omp --profile <name> config path`; never hardcode `~/.omp`.
- Support both native `config.yml` and `config.yaml` input files.
- Default install name is `<github-owner>-<profile-name>`; `--name` overrides it.
- Validate OMP profile-name rules: lowercase ASCII letters/digits plus `.`, `_`, `-`; max 64 characters; no trailing `.`, `.`/`..`, or Windows reserved names.
- Existing target profiles fail without mutation; no overwrite or `--force` option.
- Local CLI validation may use installed OMP; server validation is structural and must be labeled as such.
- Profile size limit is 1 MB.
- OOMPF stores metadata/enrichment, not a permanent canonical artifact copy.
- Human CLI output is concise; useful commands support `--json`.

---

### Task 1: Scaffold the Bun workspace

**Files:**
- Create: `package.json`
- Create: `bunfig.toml`
- Create: `tsconfig.json`
- Create: `.gitignore`
- Create: `apps/cli/package.json`
- Create: `apps/cli/tsconfig.json`
- Create: `apps/web/package.json`
- Create: `apps/web/astro.config.mjs`
- Create: `apps/web/tsconfig.json`
- Create: `packages/core/package.json`
- Create: `packages/core/tsconfig.json`
- Create: `packages/github/package.json`
- Create: `packages/github/tsconfig.json`
- Create: `packages/database/package.json`
- Create: `packages/database/tsconfig.json`
- Test: `tests/smoke/workspace.test.ts`

**Interfaces:**
- Workspace package names: `@oompf/core`, `@oompf/github`, `@oompf/database`.
- Root scripts: `dev`, `build`, `test`, `typecheck`, `format`.
- CLI binary name: `oompf`.

- [ ] **Step 1: Write the workspace smoke test**

Create a Bun test that imports a trivial exported version constant from `@oompf/core` and asserts the workspace resolver works.

- [ ] **Step 2: Add package manifests and TypeScript project references**

Use Bun workspace globs for `apps/*` and `packages/*`. Keep browser-only Astro dependencies out of CLI packages and keep CLI-only `child_process`/`gh` integration out of the Worker package.

- [ ] **Step 3: Add Astro and Cloudflare configuration**

Configure Astro for server output with the Cloudflare adapter and a Wrangler-compatible build. Add a minimal `wrangler.jsonc` with a placeholder application name and compatibility date.

- [ ] **Step 4: Run the smoke test and typecheck**

Run: `bun test tests/smoke/workspace.test.ts && bun run typecheck`
Expected: PASS with all workspace packages resolving.

- [ ] **Step 5: Commit**

```bash
git add package.json bunfig.toml tsconfig.json .gitignore apps packages tests
 git commit -m "chore: scaffold OOMPF workspace"
```

### Task 2: Implement OMP profile discovery and portability primitives

**Files:**
- Create: `packages/core/src/omp-profile.ts`
- Create: `packages/core/src/profile-name.ts`
- Create: `packages/core/src/yaml-config.ts`
- Create: `packages/core/src/index.ts`
- Test: `packages/core/src/omp-profile.test.ts`
- Test: `packages/core/src/profile-name.test.ts`

**Interfaces:**
- `discoverProfiles(options?: { ompCommand?: string }): Promise<DiscoveredProfile[]>`
- `resolveProfileConfig(profile: string, options?: { ompCommand?: string }): Promise<ResolvedProfileConfig>`
- `resolveInstallTarget(name: string, options?: { ompCommand?: string }): Promise<string>`
- `validateProfileName(name: string): { ok: true; value: string } | { ok: false; reason: string }`
- `parseProfileYaml(input: string): unknown`
- `assertProfileDocument(value: unknown): Record<string, unknown>`

- [ ] **Step 1: Write failing portability tests**

Cover: `omp --profile <new-name> config path` returning an agent directory, `config.yml` preference, `config.yaml` fallback, missing profile rejection, invalid names, 64-character boundary, Windows reserved names, and `PI_CONFIG_DIR`/`OMP_PROFILE` propagation through the subprocess environment.

- [ ] **Step 2: Implement command execution and path resolution**

Invoke `omp --profile <name> config path` without shell interpolation. Trim stdout, reject empty/non-directory paths, and use platform path APIs. For discovery, inspect the configured profile root only after obtaining the base resolver behavior; do not assume POSIX home paths.

- [ ] **Step 3: Implement profile-name validation**

Mirror the upstream OMP constraints. Do not silently lowercase, truncate, or rewrite a requested name. Return actionable failure reasons.

- [ ] **Step 4: Implement YAML parsing and structural root validation**

Require a mapping root and preserve unknown keys. Parse `config.yml` and `config.yaml`; do not strip fields during normalization.

- [ ] **Step 5: Run focused tests**

Run: `bun test packages/core/src/omp-profile.test.ts packages/core/src/profile-name.test.ts`
Expected: PASS, including the non-existent profile resolver case.

- [ ] **Step 6: Commit**

```bash
git add packages/core
 git commit -m "feat: resolve portable OMP profiles"
```

### Task 3: Add validation, secret scanning, normalization, and facts

**Files:**
- Create: `packages/core/src/validation.ts`
- Create: `packages/core/src/facts.ts`
- Create: `packages/core/src/hash.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/src/validation.test.ts`
- Test: `packages/core/src/facts.test.ts`

**Interfaces:**
- `validateArtifact(input: { yaml: string; maxBytes?: number }): ArtifactValidation`
- `scanForSecrets(document: unknown): SecretFinding[]`
- `extractFacts(document: Record<string, unknown>): ProfileFacts`
- `sha256(input: string | Uint8Array): string`

- [ ] **Step 1: Write failing validation/facts tests**

Cover invalid YAML, scalar/list roots, 1 MB boundary, likely API-key/token/password values without printing secret contents, model roles, fallback chains, providers inferred from model IDs, advisor settings, hooks/extensions, and unknown-key retention.

- [ ] **Step 2: Implement structural validation**

Return separate `structural` status, warnings, high-confidence blocking findings, and facts. Use Zod for the OOMPF result envelope and narrow observed OMP fields; retain the original parsed document for publication.

- [ ] **Step 3: Implement deterministic hashing and facts extraction**

Hash canonical bytes exactly as published. Extract only reliable metadata; mark environment, project overlay, credentials, and external extension requirements explicitly.

- [ ] **Step 4: Run focused tests**

Run: `bun test packages/core/src/validation.test.ts packages/core/src/facts.test.ts`
Expected: PASS with no secret values appearing in error output.

- [ ] **Step 5: Commit**

```bash
git add packages/core
 git commit -m "feat: validate and enrich OMP artifacts"
```

### Task 4: Implement GitHub Gist integration

**Files:**
- Create: `packages/github/src/gh.ts`
- Create: `packages/github/src/gists.ts`
- Create: `packages/github/src/index.ts`
- Test: `packages/github/src/gists.test.ts`

**Interfaces:**
- `getGithubIdentity(): Promise<{ login: string }>`
- `createPublicProfileGist(input: { filename: string; content: string; description: string }): Promise<{ url: string; htmlUrl: string; gistId: string }>`
- `fetchPublicGist(source: string): Promise<GistSource>`
- `normalizeGistUrl(input: string): string`

- [ ] **Step 1: Write failing command-wrapper tests**

Mock the command runner and cover missing `gh`, unauthenticated status, public flag usage, filename preservation, non-zero exit codes, accepted Gist URL forms, private/ambiguous Gists, and raw content fetch.

- [ ] **Step 2: Implement safe `gh` invocation**

Use argument arrays, never shell strings. `publish` must invoke `gh gist create --public` with `<profile-name>.yml`; identity comes from `gh api user` or equivalent. Surface concise remediation for missing auth.

- [ ] **Step 3: Implement source fetching**

Fetch the public Gist metadata/content using GitHub’s public endpoints or raw URL. Reject multiple YAML candidates and unsupported filenames. Do not persist artifact bytes in the database layer.

- [ ] **Step 4: Run focused tests**

Run: `bun test packages/github/src/gists.test.ts`
Expected: PASS with no real Gist mutation.

- [ ] **Step 5: Commit**

```bash
git add packages/github
 git commit -m "feat: publish and fetch public Gists"
```

### Task 5: Add Drizzle/Postgres persistence

**Files:**
- Create: `packages/database/src/schema.ts`
- Create: `packages/database/src/repository.ts`
- Create: `packages/database/src/index.ts`
- Create: `packages/database/drizzle.config.ts`
- Create: `packages/database/migrations/0001_profiles.sql`
- Test: `packages/database/src/repository.test.ts`

**Interfaces:**
- `profiles` table fields: `id`, `sourceType`, `sourceUrl`, `gistId`, `owner`, `profileName`, `ompVersion`, `revision`, `contentHash`, `facts`, `validation`, `createdAt`, `updatedAt`.
- `findBySource(sourceUrl): Promise<ProfileRecord | null>`
- `createOrUpdateProfile(input): Promise<ProfileRecord>`
- `getProfile(id): Promise<ProfileRecord | null>`
- `searchProfiles(query): Promise<ProfileRecord[]>`

- [ ] **Step 1: Write repository tests against an isolated test database**

Cover first registration, same-source idempotency, changed revision metadata, stable opaque IDs, profile lookup, and search across name/owner/model/provider/advisor facts.

- [ ] **Step 2: Define Drizzle schema and migrations**

Use JSON/JSONB only for normalized facts and validation results; never add a canonical artifact blob column. Enforce unique canonical source URL and stable profile ID.

- [ ] **Step 3: Implement repository methods**

Use parameterized Drizzle queries. Keep source revision/hash current while preserving first-indexed timestamps.

- [ ] **Step 4: Run repository tests**

Run: `bun test packages/database/src/repository.test.ts`
Expected: PASS with a disposable Postgres-compatible test database.

- [ ] **Step 5: Commit**

```bash
git add packages/database
 git commit -m "feat: persist indexed profile metadata"
```

### Task 6: Build Astro registration, profile, and search routes

**Files:**
- Create: `apps/web/src/lib/services/index-profile.ts`
- Create: `apps/web/src/pages/api/profiles.ts`
- Create: `apps/web/src/pages/api/profiles/[id].ts`
- Create: `apps/web/src/pages/api/search.ts`
- Create: `apps/web/src/pages/register.astro`
- Create: `apps/web/src/pages/p/[id].astro`
- Create: `apps/web/src/pages/index.astro`
- Create: `apps/web/src/layouts/Base.astro`
- Create: `apps/web/src/styles/global.css`
- Test: `apps/web/src/lib/services/index-profile.test.ts`

**Interfaces:**
- `indexPublicGist(input: { source: string; ompVersion?: string }): Promise<ProfileRecord>`
- `POST /api/profiles` accepts `{ source: string, ompVersion?: string }` and returns `{ id, url, source, validation }`.
- `GET /api/profiles/:id` returns metadata only.
- `GET /api/search?q=...` returns compact records.

- [ ] **Step 1: Write failing service tests**

Mock Gist fetch and repository calls. Cover structural validation failures, ambiguous Gists, source idempotency, changed revisions, and no artifact persistence.

- [ ] **Step 2: Implement indexing service**

Fetch, validate, normalize, extract facts, hash, and persist metadata. Label server results `structural`; preserve publisher OMP version when supplied.

- [ ] **Step 3: Implement API routes**

Return stable JSON error envelopes with status-specific responses. Do not expose provider credentials or raw artifact contents through the database API.

- [ ] **Step 4: Implement pages**

Build an intentional developer-facing presentation: source owner, Gist URL, revision/hash, validation level, OMP version, models/providers/advisors/hooks, prerequisites, and copyable `oompf add` command. Keep the canonical GitHub link prominent.

- [ ] **Step 5: Run web tests and build**

Run: `bun test apps/web/src/lib/services/index-profile.test.ts && bun run build`
Expected: PASS and a Cloudflare-compatible Astro build.

- [ ] **Step 6: Commit**

```bash
git add apps/web
 git commit -m "feat: add OOMPF indexing and profile pages"
```

### Task 7: Implement the Incur CLI commands

**Files:**
- Create: `apps/cli/src/main.ts`
- Create: `apps/cli/src/config.ts`
- Create: `apps/cli/src/commands/publish.ts`
- Create: `apps/cli/src/commands/add.ts`
- Create: `apps/cli/src/commands/inspect.ts`
- Create: `apps/cli/src/commands/search.ts`
- Create: `apps/cli/src/output.ts`
- Test: `apps/cli/src/commands/publish.test.ts`
- Test: `apps/cli/src/commands/add.test.ts`
- Test: `apps/cli/src/commands/inspect.test.ts`

**Interfaces:**
- Incur CLI name: `oompf`.
- `publish` args: optional native OMP profile name; options include `json`.
- `add` args: `ref`; options include `name` and `json`.
- `inspect` args: `ref`; option `json`.
- `search` args: optional query; option `json`.

- [ ] **Step 1: Write failing command tests**

Cover publish orchestration, no-profile selection input, Gist filename/name preservation, high-confidence secret refusal, add path resolution through a non-existent OMP profile, collision refusal, `--name`, inspect output, search output, and JSON envelopes.

- [ ] **Step 2: Implement command services**

Compose `@oompf/core` and `@oompf/github`. Publish should report each verified phase and call the registration endpoint with the source URL and publisher OMP version. Add should fetch the canonical source, validate it, resolve the target directory through OMP, refuse existing directories, and atomically write `config.yml`.

- [ ] **Step 3: Implement Incur schemas and output**

Use Zod schemas for arguments/options/output. Keep interactive output terse and machine output stable. Never print secret values.

- [ ] **Step 4: Run focused CLI tests**

Run: `bun test apps/cli/src/commands/*.test.ts`
Expected: PASS without creating or mutating real profiles or Gists.

- [ ] **Step 5: Commit**

```bash
git add apps/cli
 git commit -m "feat: add OOMPF CLI"
```

### Task 8: Add CI, deployment configuration, and end-to-end verification

**Files:**
- Create: `.github/workflows/ci.yml`
- Create: `.github/workflows/deploy.yml`
- Modify: `wrangler.jsonc`
- Create: `.env.example`
- Create: `scripts/smoke-local.ts`
- Test: `tests/e2e/oompf-flow.test.ts`

**Interfaces:**
- CI checks: formatting, typecheck, unit tests, Astro build.
- Deployment uses Wrangler and Cloudflare secrets; no secrets committed.
- E2E smoke uses a fixture Gist adapter by default and an explicitly enabled real-Gist mode for authenticated local verification.

- [ ] **Step 1: Write the end-to-end test**

Exercise fixture publication/indexing/profile lookup/search/install and assert that the second install fails without modifying the target. Add an explicit test for `--name` success.

- [ ] **Step 2: Implement CI workflow**

Use Bun setup and lockfile installation. Run `bun run format --check`, `bun run typecheck`, `bun test`, and `bun run build`.

- [ ] **Step 3: Implement deployment workflow**

Deploy only from the configured branch after CI. Use Cloudflare/Wrangler secrets for database URL and public app URL. Do not expose GitHub tokens to the deployed Worker.

- [ ] **Step 4: Run the complete local smoke path**

Run: `bun test && bun run typecheck && bun run build && bun run scripts/smoke-local.ts`
Expected: all checks pass; smoke output proves inspect/search/install/collision behavior.

- [ ] **Step 5: Run authenticated Gist verification when credentials are available**

Run the explicit real-source smoke command with the local authenticated `gh` installation. Confirm the created Gist is public, registration returns `/p/<id>`, and the generated install command works in a disposable OMP config root.

- [ ] **Step 6: Commit**

```bash
git add .github wrangler.jsonc .env.example scripts tests
 git commit -m "ci: verify and deploy OOMPF v0"
```

## Final verification checklist

- [ ] `oompf publish` discovers a real profile without hardcoded home paths.
- [ ] Publishing uses a public Gist named `<profile-name>.yml`.
- [ ] High-confidence secrets block publication without printing values.
- [ ] Registration performs structural validation and stores metadata only.
- [ ] `/p/<id>` shows source, revision/hash, facts, validation level, prerequisites, and install command.
- [ ] `oompf inspect` works with both OOMPF URLs and public Gist URLs.
- [ ] `oompf search` returns human and JSON output.
- [ ] `oompf add` resolves a non-existent profile path through OMP and works on a disposable config root.
- [ ] Invalid/too-long/reserved names fail before filesystem mutation.
- [ ] Existing target profiles fail without mutation and without a `--force` option.
- [ ] `--name` installs successfully when the default derived name is unsuitable.
- [ ] Provider credentials, `.env`, project overlays, and external extensions remain local prerequisites.
- [ ] CI and Cloudflare build/deploy configuration contain no committed secrets.

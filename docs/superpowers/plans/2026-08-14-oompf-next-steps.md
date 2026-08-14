# OOMPF Next Steps Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the trust and discovery gaps that currently stop OOMPF from being usable by a stranger, before adding any further product surface.

**Architecture:** No new subsystems. Every task is a guard, a query, or a header on an existing seam: `packages/core` (extraction/validation), `packages/github/src/gists.ts` (fetch), `packages/database/src/repository.ts` (index reads/writes), `apps/web/src/lib/services/index-profile.ts` (service boundary), `apps/cli/src/commands/*` (user surface). Metadata-only storage and `/p/<id>` as the canonical reference are unchanged.

**Tech Stack:** Bun, TypeScript, Drizzle/Neon, Astro on Cloudflare Workers, Incur CLI, `bun:test`.

**Observed state (2026-08-14):** `https://oompf.run/` returns 200 with an **empty index** (`GET /api/v1/search` → `{"query":"","results":[]}`); npm `@grosspoetrysystems/oompf@0.2.1` matches `apps/cli/package.json`. There is no scale problem yet — there is a fillability and trust problem.

## Global Constraints

- Preserve the v0 workflow and metadata-only storage; no auth, accounts, or repository publishing.
- Every task lands with a `bun:test` behavioral test; no new test runner.
- Errors stay value-free and use existing stable codes where one fits.
- No new dependency unless a task explicitly names it (only Task 7 may, for a Cloudflare-native limiter binding).

---

### Task 1: Empty query lists recent profiles

**Why now:** `oompf search` advertises "empty lists all" (`apps/cli/src/commands/search.ts:19`) but `searchProfiles` returns `[]` for a blank query (`packages/database/src/repository.ts:275-277`). The home page hides this with `FEATURED_QUERY = "gist.github.com"` — a documented stand-in (`apps/web/src/lib/services/index-profile.ts:336-346`) that fetches every matching row and slices in JS, and silently empties if the source host ever changes. First-run discovery is the product's front door.

**Files:**
- Modify: `packages/database/src/repository.ts` (add `listRecent(limit)`, add `limit` to `searchProfiles`, extend `ProfileRepository`)
- Modify: `packages/database/src/repository.test.ts`
- Modify: `apps/web/src/lib/services/index-profile.ts` (delete `FEATURED_QUERY`; `listFeaturedProfiles` → `listRecent`; empty `q` → `listRecent`)
- Modify: `apps/web/src/lib/services/index-profile.test.ts`
- Modify: `apps/web/src/pages/api/v1/search.ts` (accept `limit`, clamp)
- Modify: `apps/web/src/lib/contracts/openapi.ts` (document `limit`, document empty-query semantics)
- Modify: `apps/cli/src/commands/search.test.ts`

- [ ] **Step 1: Write failing tests** — repository returns rows ordered by `updatedAt` desc capped at `limit`; empty-query search returns those rows; `limit` is clamped to a maximum.
- [ ] **Step 2: Run RED** — `bun test packages/database apps/web/src/lib/services apps/cli/src/commands/search.test.ts`
- [ ] **Step 3: Implement** — `.orderBy(desc(profiles.updatedAt)).limit(limit)`; SQL-level cap for both search and listing.
- [ ] **Step 4: Verify** — same command GREEN, then `bun run smoke:local` asserts a blank `oompf search` returns the seeded profile.

---

### Task 2: Refuse revision-pinned registration

**Why now:** Rows are keyed on the revision-free canonical URL (`normalizeGistUrl`, `packages/github/src/gists.ts:206-209`), but `fetchPublicGist` honors a revision when the reference carries one (`gists.ts:243-246`), and `createOrUpdateProfile` rewrites `contentHash`/`revision`/`facts` whenever any differ (`packages/database/src/repository.ts:241-257`). Any anonymous caller can therefore POST `api.github.com/gists/<id>/<older-revision>` and roll a live `/p/<id>` backwards. Unauthenticated writes make this a one-request attack.

**Files:**
- Modify: `apps/web/src/lib/services/index-profile.ts` (reject a revision-carrying source in `indexPublicGist`/`parseRegisterBody`)
- Modify: `apps/web/src/lib/services/index-profile.test.ts`
- Modify: `apps/web/src/content/docs/provenance-and-revisions.md`

- [ ] **Step 1: Write failing test** — POST of `https://api.github.com/gists/<id>/<rev>` returns 400 `invalid_source` and leaves the stored row byte-identical.
- [ ] **Step 2: Run RED** — `bun test apps/web/src/lib/services/index-profile.test.ts`
- [ ] **Step 3: Implement** — parse the location once; when `revision !== null`, throw `IndexError("invalid_source", 400, "Register the Gist, not a specific revision.")`. Registration always indexes head; `add` keeps installing the pinned indexed revision.
- [ ] **Step 4: Verify** — GREEN, plus an existing-row-unchanged assertion.

---

### Task 3: Bound the gist fetch

**Why now:** `fetchPublicGist` reads the whole raw body (`await rawResponse.text()`, `packages/github/src/gists.ts:273`) and hashes it; the 1 MiB limit is enforced only later in `validateArtifact` (`packages/core/src/validation.ts`, `DEFAULT_MAX_BYTES`). A gist whose raw file is arbitrarily large is fully downloaded into the Worker on every unauthenticated POST, `inspect`, and `add`.

**Files:**
- Modify: `packages/github/src/gists.ts` (check `content-length`, then cap while reading; abort past the limit)
- Modify: `packages/github/src/gists.test.ts`

- [ ] **Step 1: Write failing test** — an injected fetch advertising/streaming more than the cap rejects with a value-free error and never hashes.
- [ ] **Step 2: Run RED** — `bun test packages/github`
- [ ] **Step 3: Implement** — reuse `DEFAULT_MAX_BYTES` from `@oompf/core` (already a dependency); reject before `sha256`.
- [ ] **Step 4: Verify** — GREEN; a normal-size fixture still fetches and hashes identically.

---

### Task 4: Only `http`/`https` publisher links

**Why now:** `extractLink` accepts any non-empty string (`packages/core/src/metadata.ts:138-163`) and `/p/<id>` renders it straight into `href` (`apps/web/src/pages/p/[id].astro:122`). A published profile can ship `javascript:` or `data:` links that execute on click from an OOMPF page.

**Files:**
- Modify: `packages/core/src/metadata.ts` (scheme allowlist at extraction, warn on drop)
- Modify: `packages/core/src/metadata.test.ts` — add if absent
- Modify: `apps/web/src/lib/profile-view.test.ts`

- [ ] **Step 1: Write failing test** — `oompf.links: ["javascript:alert(1)"]` is dropped with a warning; `https://` survives; existing stored rows with bad links render no anchor.
- [ ] **Step 2: Run RED** — `bun test packages/core apps/web/src/lib`
- [ ] **Step 3: Implement** — parse with `URL`; keep only `http:`/`https:`. Filter at render too, since stored rows predate the guard.
- [ ] **Step 4: Verify** — GREEN.

---

### Task 5: `add` surfaces the secret verdict

**Why now:** `add` checks only `validation.structural` and discards `validation.blocking`/`findings` (`apps/cli/src/commands/add.ts:92`). Installing a remote profile that exposes a high-confidence key prints nothing. Publish blocks these (`apps/cli/src/commands/publish.ts:143-147`) and the server refuses to index them (`apps/web/src/lib/services/index-profile.ts:177-184`), so the install path is the only place the verdict is dropped — and it is the path that writes to disk.

**Files:**
- Modify: `apps/cli/src/commands/add.ts` (refuse on `blocking`, warn on low-confidence findings)
- Modify: `apps/cli/src/output.ts` (warnings already present — carry findings through)
- Modify: `apps/cli/src/commands/add.test.ts`

- [ ] **Step 1: Write failing tests** — blocking finding → nonzero exit `blocking_secrets`, zero filesystem writes; low-confidence finding → install succeeds with a value-free warning.
- [ ] **Step 2: Run RED** — `bun test apps/cli/src/commands/add.test.ts`
- [ ] **Step 3: Implement** — reuse the existing `blocking_secrets` code; never print the value.
- [ ] **Step 4: Verify** — GREEN, plus `bun run smoke:local` (it already asserts redaction).

---

### Task 6: Repair the agent-facing doc maps

**Why now:** OOMPF's declared audience is agents, and both agent maps contain dead links. Verified: `https://oompf.run/docs/cli.md` → 404 while `/docs/cli-reference.md` → 200. `apps/web/public/llms.txt` points at `/docs/cli.md` and `/docs/profile-workflow.md`; `apps/web/public/docs/llms.txt` adds `provenance.md` and `api.md`. Real slugs: `cli-reference`, `publishing-a-profile`, `provenance-and-revisions`; there is no API doc at all.

**Files:**
- Modify: `apps/web/public/llms.txt`
- Modify: `apps/web/public/docs/llms.txt`
- Modify: `scripts/smoke-deployed.ts` (assert every `.md` link in both maps resolves 200)

- [ ] **Step 1: Write failing check** — extend `smoke-deployed` to fetch each linked doc; expect current RED on the four bad slugs.
- [ ] **Step 2: Implement** — repoint to real slugs; drop `api.md` or link `/openapi.json`.
- [ ] **Step 3: Verify** — `bun run smoke:deployed http://localhost:4321`, then against production after deploy.

---

### Task 7: Throttle and cache the public API

**Why now:** `POST /api/v1/profiles` has no auth and no rate limit (`apps/web/src/pages/api/v1/profiles.ts:22-36`); each call is two outbound GitHub fetches plus a Neon write. No read route sets a cache header (`jsonResponse`, `apps/web/src/lib/services/index-profile.ts:441-446`), so every home-page render hits the database. Tasks 1–3 remove the worst amplification; this bounds the rest.

**Files:**
- Modify: `apps/web/wrangler.jsonc` (Cloudflare rate-limiting binding)
- Modify: `apps/web/src/pages/api/v1/profiles.ts` (429 before `indexPublicGist`)
- Modify: `apps/web/src/lib/services/index-profile.ts` (`Cache-Control` on read routes, `no-store` on POST; log unexpected 500s value-free in `toErrorEnvelope`)
- Modify: `apps/web/src/lib/contracts/openapi.ts` (add the missing `429` and `500` responses)
- Modify: `apps/web/src/lib/services/index-profile.test.ts`

- [ ] **Step 1: Write failing tests** — burst POST → 429 envelope; read routes carry `Cache-Control`; POST carries `no-store`.
- [ ] **Step 2: Implement** — platform limiter, no new runtime dependency in `packages/*`.
- [ ] **Step 3: Verify** — `bun test apps/web`, then `bun run preview` and a manual burst.

---

### Task 8: Make registration race-safe

**Why now:** `createOrUpdateProfile` reads then inserts with no transaction or conflict clause (`packages/database/src/repository.ts:218-270`); two concurrent first registrations of the same gist can surface a unique/PK error instead of the documented idempotent success.

**Files:**
- Modify: `packages/database/src/repository.ts` (`insert(...).onConflictDoUpdate` on `sourceUrl`, preserving `createdAt` and the no-op path)
- Modify: `packages/database/src/repository.test.ts`

- [ ] **Step 1: Write failing test** — two overlapping `createOrUpdateProfile` calls for one source both resolve to the same row.
- [ ] **Step 2: Implement** — keep the `sameStoredValue` no-op short-circuit so unchanged re-registration still performs no write.
- [ ] **Step 3: Verify** — `bun test packages/database` and `bun run check:migrations`.

---

## Backlog (post-plan, in value order)

1. **Seed the live index.** Production has zero profiles, so every authority surface (`/p/<id>`, search, `llms.txt`, openapi) is unexercised in production and the home page shows nothing. Publish a first-party set, then extend `smoke-deployed` with a known-id `/p/<id>` read check.
2. **Publish orphan cleanup.** A failed `registerProfile` leaves the public gist behind (`apps/cli/src/commands/publish.ts` post-create path); delete it or report the orphan URL. Also return the created revision instead of `null`.
3. **Staleness signal.** Nothing re-fetches after indexing: an edited gist leaves `/p/<id>` silently stale. Add `lastCheckedAt`, a lazy head check on view, and `oompf refresh <ref>`.
4. **Search semantics.** Decide tokenization/ranking before volume arrives; drop `facts::text ILIKE` (`packages/database/src/repository.ts:290`) or back it with a pg_trgm/generated search column, and teach `check-migrations.ts` to assert the index exists.
5. **Fact coverage.** `RECOGNIZED_KEYS` (`packages/core/src/facts.ts`) covers ~20 keys of the surface catalogued in `docs/omp-profile-capabilities.md`; `task`, retry topology, tool-approval posture, and memory backend are invisible to the index. Adding fields does not backfill existing rows (`docs/architecture.md:184-191`) — a backfill is a separate deliberate step.
6. **Provider-prerequisite contract.** `packages/core/src/facts.ts` still emits `{kind:"provider"}` prerequisites that `apps/web/src/lib/profile-view.ts` filters out at render, so the API and the page disagree with the approved authority design. Fix at the source and decide whether stored rows get migrated.
7. **Secret-scan headroom.** Detection is regex + credential-key substrings (`packages/core/src/validation.ts`); a high-entropy literal under an innocuous key passes. Publishing is irreversible (public gist), so consider an entropy pass.
8. **YAML alias/depth caps** in `packages/core/src/yaml-config.ts`; the 1 MiB byte cap bounds input size but not anchor expansion.
9. **Deletion/flagging path.** No `DELETE`/tombstone exists, so a poisoned or abandoned row cannot leave the index.
10. **Deploy rollback.** `.github/workflows/deploy.yml` applies migrations, deploys, then smokes, with no rollback step and a silent skip when secrets are absent; at minimum fail loudly on manual dispatch and emit the deployed version id.
11. **Delete the phantom Vitest setup.** `vitest.config.ts` targets `tests/vitest/**`, which does not exist; `test:vitest`/`test:coverage` pass while running zero tests. Bun is authoritative (`package.json`).
12. **Docs hygiene.** Mark the two landing-motion docs superseded by the pi-carousel commits, and re-date `SECURITY.md` against the current route surface.

# OOMPF Authority Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make OOMPF the human- and agent-facing authority for OMP profiles by adding namespaced profile metadata, readable profile presentation, curated model links, authoritative docs, and versioned machine-readable contracts.

**Architecture:** Extend `@oompf/core` to validate/extract optional `oompf` metadata and classify aliases without changing native OMP facts. Persist the new metadata and derived display mappings alongside existing metadata-only profile rows. Add shared web/CLI contracts for `/api/v1`, OpenAPI/JSON Schema, llms indexes, and Markdown docs; keep current `/api` routes as compatibility aliases. Rework the profile page so human context and install flow are primary while provenance remains explained and actionable.

**Tech Stack:** Bun, TypeScript, Astro 7, Cloudflare Workers, Drizzle/Postgres, Bun test, Incur CLI, YAML parser, OpenAPI 3.1, JSON Schema 2020-12, Markdown.

## Global Constraints

- Canonical YAML remains on public GitHub; OOMPF stores metadata only.
- OMP remains the runtime authority; OOMPF documents only the profile concepts needed to share and use profiles.
- The optional metadata key is namespaced as `oompf` and must not change native OMP installation behavior.
- Unknown model/provider identifiers remain valid and are never assigned guessed URLs.
- Provider API/base URLs are not public documentation links.
- The primary install command MUST use the canonical OOMPF URL.
- Every API response keeps stable JSON envelopes and stable error codes.
- Existing `/api/...` routes remain compatibility aliases while `/api/v1/...` becomes canonical.
- Do not persist secrets or canonical YAML content.
- Tests MUST be written first, observed failing, then implemented minimally.

---

## Task 1: Add validated OOMPF metadata and alias facts

**Files:**
- Modify: `packages/core/src/facts.ts`
- Modify: `packages/core/src/validation.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/src/facts.test.ts`
- Test: `packages/core/src/validation.test.ts`

**Interfaces:**
- Produce `OompfMetadata` with `summary: string | null`, `kind: string | null`, and `tags: readonly string[]`.
- Extend `ProfileFacts` with `oompf` metadata and `aliases: readonly string[]`.
- Keep concrete `models` limited to provider/model selectors and other non-alias model identifiers.
- Preserve the existing `prerequisites` shape for compatibility, but stop adding provider prerequisites for providers already represented by model selectors.

- [ ] Write a failing fact test for valid metadata:
  ```ts
  test("extracts bounded oompf metadata and separates aliases", () => {
    const facts = extractFacts({
      enabledModels: ["opencode-go/kimi-k2.7-code", "@tiny"],
      oompf: {
        summary: "A fast coding profile.",
        kind: "coding",
        tags: ["kimi", "fast"],
      },
    });
    expect(facts.oompf).toEqual({
      summary: "A fast coding profile.",
      kind: "coding",
      tags: ["kimi", "fast"],
    });
    expect(facts.models).toEqual(["opencode-go/kimi-k2.7-code"]);
    expect(facts.aliases).toEqual(["@tiny"]);
  });
  ```
- [ ] Run `bun test packages/core/src/facts.test.ts -t 'oompf metadata'`; confirm failure because metadata and alias facts do not exist.
- [ ] Add bounded parsing/normalization for `oompf.summary`, `oompf.kind`, and `oompf.tags`; use standard kinds `coding`, `research`, `review`, `creative`, and `general` while allowing a short custom fallback.
- [ ] Treat model values beginning with `@` as aliases; retain them in `aliases` and exclude them from `models` and inferred providers.
- [ ] Remove provider prerequisite generation when the provider is already inferred from a concrete selector; retain environment, extension, and project-overlay prerequisites.
- [ ] Add validation tests for missing metadata, wrong types, overlong summary/tags, and custom kind fallback.
- [ ] Run focused core tests and confirm all pass.
- [ ] Commit `feat: extract OOMPF metadata and aliases`.

## Task 2: Persist metadata and publish/inspect it

**Files:**
- Modify: `packages/database/src/schema.ts`
- Create: `packages/database/migrations/0002_oompf_metadata.sql`
- Modify: `packages/database/src/repository.ts`
- Modify: `packages/database/src/repository.test.ts`
- Modify: `apps/web/src/lib/services/index-profile.ts`
- Modify: `apps/web/src/pages/api/profiles.ts`
- Modify: `apps/cli/src/api.ts`
- Modify: `apps/cli/src/commands/publish.ts`
- Modify: `apps/cli/src/commands/inspect.ts`
- Test: `apps/web/src/lib/services/index-profile.test.ts`
- Test: `apps/cli/src/commands/publish.test.ts`
- Test: `apps/cli/src/commands/inspect.test.ts`

**Interfaces:**
- Store OOMPF metadata in the profile row as JSON metadata, never canonical YAML.
- `indexPublicGist` derives metadata from `validateArtifact` and persists it idempotently.
- `publish` sends no inferred runtime version; `setupVersion` remains a config marker, not `ompVersion`.
- `inspect` exposes `oompf`, `aliases`, and filtered prerequisites.

- [ ] Write a failing repository test showing unchanged content can refresh metadata from `null` to a summary and back without storing YAML.
- [ ] Run the focused repository test and verify the expected failure.
- [ ] Add the migration and Drizzle schema field with a nullable JSON shape.
- [ ] Update repository insert/update/idempotence logic to refresh metadata when content is unchanged but derived metadata changes.
- [ ] Add index-service tests for metadata persistence and API serialization.
- [ ] Update CLI output schemas and tests so JSON includes metadata and aliases while omitting the fake `ompVersion` derived from `setupVersion`.
- [ ] Run focused database, web service, publish, and inspect tests.
- [ ] Commit `feat: persist OOMPF profile metadata`.

## Task 3: Add curated provider/model enrichment

**Files:**
- Create: `packages/core/src/provider-links.ts`
- Create: `packages/core/src/provider-links.test.ts`
- Modify: `packages/core/src/facts.ts`
- Modify: `packages/core/src/index.ts`
- Modify: `packages/database/src/schema.ts`
- Modify: `packages/database/src/repository.ts`
- Modify: `apps/web/src/lib/services/index-profile.ts`
- Create: `apps/web/src/pages/api/v1/mappings/providers.ts`
- Create: `apps/web/src/pages/api/v1/mappings/models/[provider].ts`
- Create: `apps/web/src/pages/api/mappings/providers.ts`
- Create: `apps/web/src/pages/api/mappings/models/[provider].ts`

**Interfaces:**
- `ProviderLink` contains provider ID, display name, homepage/docs URL, and optional model URL templates.
- `ModelDisplay` contains exact selector, friendly name, provider ID, optional canonical URL, and `isAlias` classification.
- Unknown providers/models produce valid display data with `url: null`.

- [ ] Write failing mapping tests for known provider/model patterns and unknown values:
  ```ts
  test("maps known models without guessing unknown URLs", () => {
    expect(resolveModelDisplay("opencode-go/kimi-k2.7-code")).toMatchObject({
      selector: "opencode-go/kimi-k2.7-code",
      isAlias: false,
      url: expect.any(String),
    });
    expect(resolveModelDisplay("unknown-provider/model").url).toBeNull();
    expect(resolveModelDisplay("@tiny").isAlias).toBe(true);
  });
  ```
- [ ] Run the mapping test and confirm failure.
- [ ] Implement a small explicit registry for verified providers and model patterns; do not derive links from API `baseUrl`.
- [ ] Enrich stored/display facts without making URL resolution part of native OMP validation.
- [ ] Add versioned mapping endpoints and compatibility aliases with JSON content types and stable error envelopes.
- [ ] Run mapping and API route tests.
- [ ] Commit `feat: add curated provider and model mappings`.

## Task 4: Add versioned API and machine-readable contracts

**Files:**
- Create: `apps/web/src/pages/api/v1/profiles.ts`
- Create: `apps/web/src/pages/api/v1/profiles/[id].ts`
- Create: `apps/web/src/pages/api/v1/search.ts`
- Create: `apps/web/src/pages/openapi.json.ts`
- Create: `apps/web/public/schemas/profile-metadata.json`
- Create: `apps/web/public/schemas/profile-mappings.json`
- Create: `apps/web/public/schemas/error.json`
- Modify: `apps/web/src/pages/api/profiles.ts`
- Modify: `apps/web/src/pages/api/profiles/[id].ts`
- Modify: `apps/web/src/pages/api/search.ts`
- Modify: `apps/cli/src/api.ts`
- Test: `apps/web/src/pages/api/profiles.test.ts` or existing route/service test location

**Interfaces:**
- Canonical routes are `/api/v1/profiles`, `/api/v1/profiles/:id`, `/api/v1/search`, and `/api/v1/mappings/...`.
- Existing `/api/...` routes delegate to the same handlers as compatibility aliases.
- `/openapi.json` is a valid OpenAPI 3.1 document describing all canonical operations, parameters, response schemas, and error codes.

- [ ] Write failing route/contract tests asserting v1 profile and search routes return the same metadata envelope as compatibility routes.
- [ ] Add OpenAPI and JSON Schema documents with `$id`, required/optional fields, examples, and stable error envelope definitions.
- [ ] Implement v1 route delegation and preserve compatibility route behavior.
- [ ] Update CLI HTTP client to use v1 routes while retaining injected test seams.
- [ ] Validate the OpenAPI document and schemas in tests using a local structural validator; assert every documented route exists.
- [ ] Run API tests and CLI tests.
- [ ] Commit `feat: publish versioned OOMPF API contracts`.

## Task 5: Add llms indexes and Markdown documentation

**Files:**
- Create: `apps/web/public/llms.txt`
- Create: `apps/web/public/docs/llms.txt`
- Create: `apps/web/public/llms-full.txt` (optional generated convenience export only)
- Create: `apps/web/src/pages/docs/index.astro`
- Create: `apps/web/src/pages/docs/[...slug].astro`
- Create: `apps/web/src/content/docs/*.md`
- Modify: `apps/web/src/layouts/Base.astro`
- Modify: `apps/web/src/pages/docs/index.astro`
- Test: `apps/web/src/pages/docs/docs.test.ts` or route-level smoke coverage

**Interfaces:**
- `/llms.txt` is concise and links to `/docs/llms.txt`, `/openapi.json`, schemas, CLI docs, and profile workflow docs.
- `/docs/llms.txt` covers only documentation URLs and links to clean Markdown pages.
- Human docs and Markdown content share one source of truth; no manually divergent HTML/text copies.
- Every docs page includes alternate Markdown and described-by metadata.

- [ ] Write a failing smoke assertion for `/llms.txt`, `/docs/llms.txt`, `/openapi.json`, and a representative `.md` page.
- [ ] Add docs content for What is OOMPF, OMP profiles, profile format, `oompf:` metadata, models/providers, CLI commands, publishing, installation, provenance, and compatibility.
- [ ] Add concise link descriptions and interpretation notes following the llms.txt proposal; keep `/llms-full.txt` explicitly optional/non-normative.
- [ ] Add global Docs navigation and page metadata links.
- [ ] Add content checks ensuring docs examples use OOMPF URLs and do not claim OOMPF controls OMP runtime behavior.
- [ ] Run docs route tests and Astro typecheck.
- [ ] Commit `docs: add OOMPF authority documentation`.

## Task 6: Rework profile page for human readability

**Files:**
- Modify: `apps/web/src/pages/p/[id].astro`
- Modify: `apps/web/src/styles/global.css`
- Modify: `apps/web/src/lib/services/index-profile.ts`
- Test: `apps/web/src/pages/p/profile-page.test.ts` or existing smoke coverage

**Interfaces:**
- Profile page consumes `ProfileRecord` enriched with metadata, aliases, model display mappings, provider links, and provenance.
- Install command is `oompf add https://oompf.run/p/<id>`.

- [ ] Write failing page assertions for OOMPF URL installation, summary/kind/tags, aliases separated from models, providers absent from requirements, and explained provenance.
- [ ] Implement the new page sections: summary header, friendly-first models, linked provider tags, OMP aliases, behavior, actionable requirements, and expandable Source & Provenance.
- [ ] Link source revision to the GitHub revision URL and make the full SHA-256 copyable with explanation.
- [ ] Remove raw machine identifiers from the primary header and remove duplicated provider prerequisites.
- [ ] Add accessible labels, keyboard-operable copy controls, and clear empty states for absent sections.
- [ ] Run page tests and browser smoke against a real published Kimi profile.
- [ ] Commit `feat: make profile pages human and agent friendly`.

## Task 7: End-to-end verification and deployment

**Files:**
- Modify: `scripts/smoke-local.ts` if existing smoke assertions need new contracts.
- Modify: `README.md` only for repository/developer setup changes; public docs are canonical for user guidance.
- Test: existing full suite and production smoke commands.

- [ ] Run `bun test` and verify the complete suite passes.
- [ ] Run `bun run lint`, `bun run typecheck`, and `bun run build`.
- [ ] Run the local smoke flow covering publish, registration, v1 inspect/search, and isolated add installation.
- [ ] Start the deployed app and verify `/`, `/docs`, `/llms.txt`, `/docs/llms.txt`, `/openapi.json`, `/api/v1/search`, and one profile page.
- [ ] Verify the published Kimi profile shows a friendly summary/model presentation, no duplicate provider requirements, a canonical OOMPF install command, and useful provenance links.
- [ ] Verify compatibility `/api/...` routes still return the documented envelope.
- [ ] Run the GitHub Actions CI and Cloudflare deployment workflows.
- [ ] Commit any only-necessary smoke/documentation adjustments and record the deployed revision.

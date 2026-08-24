# Deterministic Model Upgrade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a deterministic `oompf upgrade <OOMPF ref>` flow that proposes model-only replacements, patches the current owned Gist in place, and preserves the stable OOMPF profile identity.

**Architecture:** A small code-reviewed catalog in `packages/core` defines explicit model successors and slot metadata. A pure planner transforms only recognized model-selector locations. The CLI fetches the indexed profile and the Gist's current head, previews a diff, then—after confirmation—patches the same Gist and re-registers the unchanged source URL.

**Tech Stack:** Bun, TypeScript, `bun:test`, Incur, `yaml`, GitHub CLI through the existing command seam, OOMPF Astro API, Postgres profile index.

**Spec:** `docs/superpowers/specs/2026-08-24-model-upgrade-design.md`

## Global Constraints

- No live provider lookup or inference during `upgrade`.
- No new Postgres catalog tables, KV/R2 bindings, React Query dependency, or catalog API in this first implementation.
- Current Gist head is mandatory patch input; never overwrite it with the indexed pinned revision.
- Same source URL must remain the profile identity after re-registration.
- Transform only `modelRoles`, `enabledModels`, and `retry.fallbackChains`; preserve all other YAML data.
- Never print or persist secrets; patch only public Gists owned by the authenticated GitHub user.
- Tests use `bun:test`; every new behavior follows red → green → refactor.
- Run narrow tests during tasks; run `bun run gate` only in the verification phase.

---

### Task 1: Add the versioned model-slot catalog

**Files:**
- Create: `packages/core/src/model-catalog.ts`
- Create: `packages/core/src/model-catalog.test.ts`
- Modify: `packages/core/src/index.ts`

**Interfaces:**

```ts
export type ModelTier = "balanced" | "economy" | "frontier";
export type CatalogRole = "chat" | "coding" | "planning" | "review";
export type ReasoningClass = "none" | "reasoning" | "standard";
export type DeploymentClass = "hosted" | "open-weight";

export interface ModelCatalogEntry {
  readonly deployment: DeploymentClass;
  readonly docsUrl: string | null;
  readonly id: string;
  readonly providerId: string;
  readonly reasoning: ReasoningClass;
  readonly roles: readonly CatalogRole[];
  readonly successor: string | null;
  readonly tier: ModelTier;
}

export interface ModelCatalog {
  readonly revision: string;
  readonly models: readonly ModelCatalogEntry[];
}

export const MODEL_CATALOG: ModelCatalog;
export function findCatalogModel(id: string): ModelCatalogEntry | null;
```

- [ ] **Step 1: Write failing catalog tests.** Assert the catalog revision is non-empty, ids are unique, every successor points to a catalog entry, provider ids match the selector prefix, and an unknown id returns `null`.
- [ ] **Step 2: Run `bun test packages/core/src/model-catalog.test.ts` and verify it fails because the module does not exist.**
- [ ] **Step 3: Add the minimal versioned catalog.** Include only explicit mappings that can be reviewed from current provider/model knowledge; do not invent successors. Keep display-link data in `provider-links.ts`; this catalog only governs upgrade equivalence.
- [ ] **Step 4: Export the types and lookup from `packages/core/src/index.ts`.**
- [ ] **Step 5: Run the catalog test and verify it passes.**
- [ ] **Step 6: Add a maintainer-only `scripts/check-model-catalog.ts` only if the catalog needs source validation.** It must default to read-only validation and accept public lookup/dev-key inputs only as optional refresh evidence; it must not update production or call inference.
- [ ] **Step 7: Commit:** `feat(GPS-150): add deterministic model successor catalog`.

---

### Task 2: Implement the pure YAML upgrade planner

**Files:**
- Create: `packages/core/src/upgrade.ts`
- Create: `packages/core/src/upgrade.test.ts`
- Modify: `packages/core/src/index.ts`

**Interfaces:**

```ts
export interface UpgradeChange {
  readonly from: string;
  readonly path: string;
  readonly reason: "successor";
  readonly role: string | null;
  readonly to: string;
}

export interface UpgradeUnchanged {
  readonly model: string;
  readonly path: string;
  readonly reason:
    | "already_current"
    | "no_successor"
    | "slot_mismatch"
    | "unavailable";
}

export interface UpgradePlan {
  readonly changes: readonly UpgradeChange[];
  readonly catalogRevision: string;
  readonly unchanged: readonly UpgradeUnchanged[];
  readonly yaml: string;
}

export function proposeUpgrade(
  yaml: string,
  catalog: ModelCatalog
): UpgradePlan;
```

- [ ] **Step 1: Write failing tests for one explicit successor in `modelRoles`.** Assert the returned YAML changes only that selector and reports the path and role.
- [ ] **Step 2: Run the focused test and verify the missing-module failure.**
- [ ] **Step 3: Add tests for `modelRoles` arrays, `enabledModels`, and both `retry.fallbackChains` map/list forms.** Assert fallback order is unchanged except for selector replacement.
- [ ] **Step 4: Add tests proving aliases, thinking suffixes, advisor fields, unknown keys, and unrelated scalar values are unchanged.**
- [ ] **Step 5: Add tests for no successor, unavailable successor, and already-current selectors.**
- [ ] **Step 6: Implement with the existing `yaml` dependency.** Parse a YAML document, walk only the four recognized locations, preserve suffixes by replacing the base model (`provider/model:high` → `provider/successor:high`), and stringify the document. Never recursively replace arbitrary strings.
- [ ] **Step 7: Run the focused tests, then the full `packages/core` tests.**
- [ ] **Step 8: Mutation-test the planner by disabling one recognized location and confirming its test fails; restore it.**
- [ ] **Step 9: Commit:** `feat(GPS-150): plan deterministic model upgrades`.

---

### Task 3: Add current-head Gist patching

**Files:**
- Modify: `packages/github/src/gh.ts`
- Modify: `packages/github/src/gh.test.ts`
- Modify: `packages/github/src/index.ts`

**Interfaces:**

```ts
export interface UpdatePublicProfileGistInput {
  readonly content: string;
  readonly filename: string;
  readonly gistId: string;
}

export interface UpdatedGist {
  readonly gistId: string;
  readonly htmlUrl: string;
  readonly revision: string | null;
}

export function updatePublicProfileGist(
  input: UpdatePublicProfileGistInput,
  options?: GhOptions
): Promise<UpdatedGist>;
```

- [ ] **Step 1: Write a failing command-seam test.** Assert the helper invokes `gh api --method PATCH gists/<id> --input -`, sends JSON with only the target filename/content, and parses the returned URL/id/revision.
- [ ] **Step 2: Run `bun test packages/github/src/gh.test.ts` and verify the missing export failure.**
- [ ] **Step 3: Add tests for non-zero exit, malformed JSON, missing URL/id, and an input filename/content containing shell-sensitive characters.** Assert argv remains discrete and content goes through stdin.
- [ ] **Step 4: Implement the helper using the existing `CommandRunner`; never shell-quote or concatenate a shell command.** Preserve the Gist description by omitting it from the patch body.
- [ ] **Step 5: Run the focused GitHub tests and verify they pass.**
- [ ] **Step 6: Commit:** `feat(GPS-150): patch owned profile gists in place`.

---

### Task 4: Build the CLI upgrade preview and confirmation flow

**Files:**
- Modify: `apps/cli/src/api.ts`
- Modify: `apps/cli/src/deps.ts`
- Modify: `apps/cli/src/output.ts`
- Create: `apps/cli/src/commands/upgrade.ts`
- Create: `apps/cli/src/commands/upgrade.test.ts`
- Modify: `apps/cli/src/index.ts`
- Modify: `apps/cli/src/registration.test.ts`

**Interfaces:**

```ts
export interface UpgradeCommandResult {
  readonly changes: readonly UpgradeChange[];
  readonly catalogRevision: string;
  readonly currentRevision: string;
  readonly oompfUrl: string;
  readonly unchanged: readonly UpgradeUnchanged[];
  readonly updatedRevision: string | null;
}
```

- [ ] **Step 1: Write a failing command-registration test.** Assert `oompf --help` lists `upgrade`.
- [ ] **Step 2: Run `bun test apps/cli/src/registration.test.ts` and verify it fails because the command is absent.**
- [ ] **Step 3: Add failing preview tests.** Use the existing `apiFetch`, memory filesystem, and command-runner seams to assert the command fetches indexed metadata, then fetches the current Gist head via `https://api.github.com/gists/<gistId>` (not the indexed revision), and emits a diff without calling the patch helper or register endpoint.
- [ ] **Step 4: Add a test proving newer current-head author edits survive the planner.** The indexed revision and current head must differ; the output must plan from current content.
- [ ] **Step 5: Implement metadata/source helpers.** Reuse `fetchProfileMetadata`, `parseOompfRef`, and `fetchPublicGist`. Reject missing `gistId`/`revision` and non-owned sources before planning.
- [ ] **Step 6: Implement the preview command.** Accept `oompf upgrade <OOMPF ref>`, default to human diff output, support `--json`, and report catalog revision plus unchanged reasons.
- [ ] **Step 7: Add confirmation tests.** Assert cancellation performs zero writes, `--yes` patches the Gist once, then registers the unchanged source URL once, and returns the same OOMPF URL/id with a new revision/hash.
- [ ] **Step 8: Implement the confirmed flow.** Fetch current head again immediately before patching, re-run validation and secret scan on transformed YAML, call `updatePublicProfileGist`, then call `registerProfile` with the original canonical source URL. If registration fails after patching, return a non-zero error stating the Gist changed but indexing did not; never claim success.
- [ ] **Step 9: Add no-op and failure tests.** No successor, stale/malformed catalog, invalid YAML, blocking secret, non-owner, patch failure, and registration failure must all avoid false success; no-op must avoid patch/register writes.
- [ ] **Step 10: Wire the command into `apps/cli/src/index.ts` and update command help.**
- [ ] **Step 11: Run all CLI command tests and the E2E smoke test.**
- [ ] **Step 12: Commit:** `feat(GPS-150): add confirmed profile upgrade flow`.

---

### Task 5: Review, gate, and ship

**Files:**
- Review all changed files and generated package output.
- Modify only the files required by review findings.

- [ ] **Step 1: Run an independent reviewer over the diff.** Review identity stability, current-head safety, YAML preservation, secret handling, and no-write preview behavior.
- [ ] **Step 2: Mutation-test the critical guards.** Temporarily break current-head fetch, preview no-write, alias preservation, suffix preservation, and same-source registration; confirm tests fail; restore each mutation.
- [ ] **Step 3: Run `bunx ultracite fix` on changed files.**
- [ ] **Step 4: Run `bun run gate`.**
- [ ] **Step 5: Create signed commits/PRs with GPS-150 scope, watch CI, and merge normally.**
- [ ] **Step 6: Wait for deployment and verify a real owned fixture:** preview shows a successor, confirmation patches the current Gist, `/p/<id>` remains unchanged, revision/content hash changes, and a second `upgrade` is a no-op.
- [ ] **Step 7: Update GPS-150 and GPS-151 with evidence and close the tickets.**

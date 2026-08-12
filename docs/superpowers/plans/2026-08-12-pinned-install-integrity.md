# Pinned Install Integrity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `oompf add <oompf-id-or-url>` install and verify the exact Gist revision indexed by OOMPF before writing a local profile.

**Architecture:** Keep direct Gist installs unchanged. For OOMPF references, resolve metadata first, fetch the stored revision when present, then compare the fetched YAML SHA-256 with `contentHash`; fail before validation or filesystem writes on mismatch. This is a chain-of-custody check, not a safety verdict. GPS-118 owns the future Merkle-root design for multi-file artifacts.

**Tech Stack:** TypeScript, Bun test, Incur CLI, GitHub Gist API, `@oompf/core` SHA-256.

## Global Constraints

- `oompf add <oompf-id-or-url>` must verify indexed bytes before writing locally.
- A stored Gist revision must be used when available; a revision-free legacy record still verifies the current fetch against its stored hash.
- Fingerprint mismatches use a stable machine-readable error code and a value-free message.
- Direct Gist references remain live, structurally validated installs without indexed verification claims.
- Integrity must not be described as protection from malicious but unchanged prompts, rules, hooks, plugins, or configuration.
- No signing infrastructure or new trust roots.

---

### Task 1: Enforce indexed install integrity

**Files:**
- Modify: `apps/cli/src/commands/add.test.ts`
- Modify: `apps/cli/src/test-helpers.ts`
- Modify: `apps/cli/src/commands/add.ts`
- Modify: `apps/web/src/content/docs/provenance-and-revisions.md`
- Modify: `apps/web/src/content/docs/getting-started.md`

**Interfaces:**
- Consumes: `fetchProfileMetadata(baseUrl, id, fetch): Promise<ProfileRecord>`, `fetchPublicGist(source, options): Promise<GistSource>`, and `CommandError`.
- Produces: OOMPF-reference installs that request `<canonical-source>/<revision>` when `revision` is present and throw `CommandError("fingerprint_mismatch", ...)` when `gist.contentHash !== record.contentHash`.

- [ ] **Step 1: Write failing tests**

Add one test that records Gist API URLs and expects an OOMPF reference to request `https://api.github.com/gists/<id>/<revision>`. Add another with mismatched indexed metadata and assert a nonzero exit, `fingerprint_mismatch`, and zero filesystem writes. Keep the direct-Gist test proving it remains live and installable.

- [ ] **Step 2: Run tests to verify RED**

Run: `bun test apps/cli/src/commands/add.test.ts`

Expected: the pinned-URL and mismatch assertions fail because `add` currently discards `revision` and `contentHash`.

- [ ] **Step 3: Implement the minimal verification path**

Retain the fetched `ProfileRecord` for OOMPF references. Build the Gist fetch reference from `record.sourceUrl` plus `record.revision` when present. After `fetchPublicGist`, compare its `contentHash` with the indexed `record.contentHash`; throw `new CommandError("fingerprint_mismatch", "The fetched profile does not match the fingerprint indexed by OOMPF.")` before structural validation and all filesystem operations.

Update the shared metadata fixture to use `sha256(CONTENT)` so successful OOMPF installs represent a valid indexed record.

- [ ] **Step 4: Verify GREEN**

Run: `bun test apps/cli/src/commands/add.test.ts`

Expected: all add tests pass, including pinned fetch, mismatch rejection, and direct Gist behavior.

- [ ] **Step 5: Update user-facing documentation**

State that OOMPF references fetch the stored revision and verify SHA-256 before installation. State that direct Gist references fetch their requested/current revision and have no indexed fingerprint comparison. Describe integrity as protection against changed bytes, not malicious content that was indexed unchanged.

- [ ] **Step 6: Verify the repository**

Run: `bun run knip && bun run lint && bun run test && bun run typecheck && bun run build && bun scripts/check-migrations.ts && bun run smoke:local`

Expected: exit 0; test output reports zero failures; Astro may report the existing `astro:content` deprecation hints.

- [ ] **Step 7: Commit**

```bash
git add apps/cli/src/commands/add.ts apps/cli/src/commands/add.test.ts apps/cli/src/test-helpers.ts apps/web/src/content/docs/provenance-and-revisions.md apps/web/src/content/docs/getting-started.md docs/superpowers/plans/2026-08-12-pinned-install-integrity.md
git commit -m "fix(cli): verify indexed profiles before install"
```

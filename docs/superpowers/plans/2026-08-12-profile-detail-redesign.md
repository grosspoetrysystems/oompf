# Profile Detail Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make OOMPF profile detail pages compact and scan-friendly while preserving exact selectors, source trust data, and actionable requirements.

**Architecture:** Add a conservative selector-display parser in `@oompf/core`, then shape friendly model references once in the profile presentation model. Render the approved source strip and two-column grids in Astro/CSS, leaving source extraction and persistence unchanged.

**Tech Stack:** Bun 1.3, TypeScript 5.9, Astro 7, plain CSS, `bun:test`.

## Global Constraints

- Desktop/tablet grids use at most two columns; layouts stack at 760px and below.
- Exact selectors remain visible in Models even when Behavior uses friendly labels.
- Never split literal tags such as `:latest`; guarded `:max` and `:auto` remain literal without evidence that the base selector is a known curated model.
- Requirements render only for existing non-provider `ProfileFacts.prerequisites`.
- Do not add dependencies, URL guessing, a multi-file artifact format, or new requirement inference.
- Preserve install-copy behavior, warnings, author metadata, curated links, and validation/version badges.

---

### Task 1: Selector display parsing

**Files:**
- Modify: `packages/core/src/provider-links.ts`
- Modify: `packages/core/src/provider-links.test.ts`
- Modify: `packages/core/src/index.ts`

**Interfaces:**
- Produces: `parseModelSelectorDisplay(selector: string): { modelSelector: string; thinkingLevel: string | null }`
- Consumes: the existing curated model registry to disambiguate guarded `max`/`auto` suffixes.

- [ ] **Step 1: Write failing parser tests**

Add assertions covering:

```ts
expect(parseModelSelectorDisplay("anthropic/claude-opus-4:high")).toEqual({
  modelSelector: "anthropic/claude-opus-4",
  thinkingLevel: "high",
});
expect(parseModelSelectorDisplay("ollama/qwen3.6:latest")).toEqual({
  modelSelector: "ollama/qwen3.6:latest",
  thinkingLevel: null,
});
expect(parseModelSelectorDisplay("unknown/glm-4.7:max")).toEqual({
  modelSelector: "unknown/glm-4.7:max",
  thinkingLevel: null,
});
```

Also cover an unambiguous abbreviation and a guarded known-model `:max` selector.

- [ ] **Step 2: Verify the tests fail for the missing export**

Run: `bun test packages/core/src/provider-links.test.ts`
Expected: FAIL because `parseModelSelectorDisplay` is not exported.

- [ ] **Step 3: Implement conservative suffix parsing**

Match OMP's unambiguous two-or-more-character prefix behavior for `inherit`, `off`, `minimal`, `low`, `medium`, `high`, and `xhigh`. Split `max`/`auto` only when the base selector exists in the curated registry and the full selector does not. Return the source value normalized to its full thinking-level label.

- [ ] **Step 4: Export and verify**

Export the parser from `packages/core/src/index.ts` and run:

```bash
bun test packages/core/src/provider-links.test.ts
bun run --filter=@oompf/core typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/provider-links.ts packages/core/src/provider-links.test.ts packages/core/src/index.ts
git commit -m "feat(core): parse model thinking suffixes"
```

### Task 2: Profile presentation model

**Files:**
- Create: `apps/web/src/lib/profile-view.test.ts`
- Modify: `apps/web/src/lib/profile-view.ts`

**Interfaces:**
- Consumes: `parseModelSelectorDisplay` and the injected `resolveModel` dependency.
- Produces: render-ready model references with `friendlyName`, `isAlias`, `selector`, `thinkingLevel`, and `url`; `ProvenanceView.indexedLabel`.

- [ ] **Step 1: Write failing view tests**

Build a realistic `ProfileRecord` fixture with concrete selectors, an Ollama `:latest` tag, `@tiny`, model roles, fallback chains, provider links, source revision, and non-provider prerequisites. Assert that:

```ts
expect(view.models[0]).toMatchObject({
  friendlyName: "Claude Opus 4",
  selector: "anthropic/claude-opus-4:high",
  thinkingLevel: "high",
});
expect(view.behavior.modelRoles[0]).toMatchObject({
  role: "slow",
  model: { friendlyName: "Claude Opus 4", thinkingLevel: "high" },
});
expect(view.behavior.modelRoles.at(-1)?.model.friendlyName).toBe("tiny role");
expect(view.provenance.indexedLabel).toBe("Aug 12, 2026");
expect(view.requirements).toHaveLength(1);
```

- [ ] **Step 2: Verify the tests fail against the old string-only view**

Run: `bun test apps/web/src/lib/profile-view.test.ts`
Expected: FAIL because model role entries do not contain render-ready model objects and provenance has no label.

- [ ] **Step 3: Implement one model-reference shaper**

Create a local helper that parses the selector, resolves the base model, preserves the exact source selector, maps `@name` to the display label `<name> role`, and returns the thinking level. Reuse it for Models, Model Roles, and Fallback Chains. Format `indexedAt` as an English UTC date label.

- [ ] **Step 4: Verify view behavior**

Run:

```bash
bun test apps/web/src/lib/profile-view.test.ts
bun run --filter=@oompf/web typecheck
```

Expected: PASS with Astro's existing deprecation hints only.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/profile-view.ts apps/web/src/lib/profile-view.test.ts
git commit -m "feat(web): shape compact profile facts"
```

### Task 3: Compact profile page and documentation

**Files:**
- Modify: `apps/web/src/pages/p/[id].astro`
- Modify: `apps/web/src/styles/global.css`
- Modify: `apps/web/src/content/docs/models-and-providers.md`

**Interfaces:**
- Consumes: the render-ready `ProfileView` from Task 2.
- Produces: the approved context strip, Models grid, Behavior grid, conditional Requirements section, and alias documentation.

- [ ] **Step 1: Capture the current browser failure**

At 1568px, assert the current page has four Behavior columns, a standalone aliases heading, an empty Requirements heading, and a bottom `.provenance` accordion. This must reproduce before markup changes.

- [ ] **Step 2: Replace page information architecture**

Render the provider/source context strip after the header. Move canonical source, revision, indexed label, and full fingerprint copy control into it. Remove the standalone Providers and OMP aliases sections plus the bottom provenance accordion. Wrap Requirements in `view.requirements.length > 0`.

- [ ] **Step 3: Render compact friendly model references**

Use two-column model items with friendly-name links, exact selectors, and optional thinking badges. Render Behavior role/fallback values through a small shared Astro fragment/component so friendly names, aliases, links, and effort badges stay consistent.

- [ ] **Step 4: Apply responsive CSS**

Use exactly `repeat(2, minmax(0, 1fr))` for Models and Behavior at wide widths, switch both plus the context strip to one column at 760px, and ensure long values wrap inside their container. Remove obsolete alias/provenance styles.

- [ ] **Step 5: Update alias documentation**

State that aliases are runtime role shortcuts documented here rather than a standalone inventory on every profile page.

- [ ] **Step 6: Verify browser behavior**

At 1568px assert two model columns, two Behavior columns, direct source/provider links, no aliases section, no empty Requirements section, and no page overflow. At 390px assert one column for each grid and no page overflow. Exercise fingerprint copy feedback and capture desktop/mobile screenshots.

- [ ] **Step 7: Run focused and full checks**

```bash
bun test packages/core/src/provider-links.test.ts apps/web/src/lib/profile-view.test.ts
bun run lint
bun run knip
bun run test
bun run typecheck
bun run --filter='@oompf/web' typecheck
bun run build
bun scripts/check-migrations.ts
bun run smoke:local
```

Expected: all commands exit 0; Astro may report only the six already-known `astro:content` deprecation hints.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/pages/p/[id].astro apps/web/src/styles/global.css apps/web/src/content/docs/models-and-providers.md docs/superpowers/specs/2026-08-12-profile-detail-redesign.md docs/superpowers/plans/2026-08-12-profile-detail-redesign.md
git commit -m "feat(web): compact profile detail pages"
```

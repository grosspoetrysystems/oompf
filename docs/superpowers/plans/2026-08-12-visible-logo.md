# Visible OOMPF Logo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show the approved multicolor OOMPF mark beside the existing wordmark in the header and footer.

**Architecture:** Add the supplied SVG as one immutable public asset. Render it from the shared `Base.astro` layout and size it in `global.css`: 24 px in the header, 28 px in the footer.

**Tech Stack:** Astro, semantic HTML, CSS, static SVG, Bun, browser smoke verification.

## Global Constraints

- Keep the `OOMPF` wordmark visible.
- Preserve the supplied SVG colors and geometry.
- Use `alt=""`; the adjacent wordmark supplies the accessible name.
- Do not change the existing favicon links, navigation behavior, footer structure, or responsive breakpoints.

---

### Task 1: Render the visible mark

**Files:**
- Create: `apps/web/public/oompf-logo.svg`
- Modify: `apps/web/src/layouts/Base.astro`
- Modify: `apps/web/src/styles/global.css`

**Interfaces:**
- Consumes: `/Users/kd-m2air/Downloads/proto_logo.svg`
- Produces: `/oompf-logo.svg` and two `img.brand-logo` elements.

- [ ] Confirm the current page has zero `img.brand-logo` elements and two obsolete `.brand-mark` diamonds.
- [ ] Copy the supplied SVG byte-for-byte to `apps/web/public/oompf-logo.svg`.
- [ ] Replace both diamond spans with decorative `.brand-logo` images, using 24 px dimensions in the header and 28 px in the footer.
- [ ] Align `.brand` items centrally, remove `.brand-mark`, and add fixed non-shrinking sizes for `.brand-logo` plus the footer override.
- [ ] Verify two logo images, the exact computed sizes, wordmark retention, and non-overlapping desktop/mobile layouts in the browser.
- [ ] Run `bun run --filter='@oompf/web' typecheck` and `bun run build`.
- [ ] Commit the implementation as `feat(web): show OOMPF logo in site chrome`.

### Task 2: Deliver and verify production

**Files:** No additional source changes expected.

**Interfaces:**
- Consumes: Task 1 commit and the existing main-branch CI/deploy workflows.
- Produces: the visible multicolor mark on `https://oompf.run`.

- [ ] Run the repository pre-push checks used by CI.
- [ ] Push `main` normally; never amend or force-push.
- [ ] Watch the CI and Deploy workflow runs through completion.
- [ ] Verify `/oompf-logo.svg` and all favicon assets return HTTP 200 in production.
- [ ] Verify desktop and mobile production pages show the multicolor mark beside `OOMPF` in header and footer.

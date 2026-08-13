# Landing Terminal and ASCII Pi Motion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the landing hero's accidental right-side gap with a grayscale, animated ASCII pi panel beside the existing terminal transcript.

**Architecture:** `index.astro` will wrap the transcript and one decorative pi panel in a responsive two-column hero grid. `global.css` will draw the grayscale block-character mark, technical grid texture, and restrained CSS-only luminance motion; the panel disappears at `900px` and motion is disabled under reduced-motion preferences. No client JavaScript, image asset, dependency, or content change is introduced.

**Tech Stack:** Astro 7, semantic HTML, CSS Grid, CSS gradients/keyframes, Chromium browser verification.

## Global Constraints

- The supplied reference governs the pi silhouette: broad cap, shorter left stem, longer right stem.
- The pi and its background are grayscale only: charcoal, graphite, silver, and off-white; no hue gradient.
- Keep the existing transcript content, hero copy, navigation, index, and documentation cards unchanged.
- The pi panel is decorative, non-focusable, and absent from the accessibility tree.
- No JavaScript, hydration, image, new font, external request, or package dependency.
- At `900px` or less, hide the pi panel and make the transcript full width.
- Under `prefers-reduced-motion: reduce`, the pi and texture remain static.
- Verify visually in the browser; do not add source-text or snapshot tests for a purely visual contract.
- Implement this as a separate UI slice from GPS-80/81 publish behavior.
- Preserve unrelated workspace changes; stage only the landing page, global stylesheet, and this task's plan/spec files when applicable.

---

### Task 1: Responsive textured ASCII pi hero

**Files:**
- Modify: `apps/web/src/pages/index.astro:72-99`
- Modify: `apps/web/src/styles/global.css:291-362,1272-1333`

**Interfaces:**
- Consumes: existing `.transcript`, `.transcript-bar`, and `.transcript-body` visual primitives.
- Produces: `.hero-demo`, `.pi-panel`, `.pi-panel-bar`, `.pi-field`, and `.pi-mark` landing-only classes.
- Preserves: the transcript's exact command/output markup and every section after the hero.

- [ ] **Step 1: Capture the current desktop baseline**

Start the existing web development server and open `/` at `1440 × 1000`. Save a viewport screenshot showing the `60rem` transcript and unused space to its right. This is the visual red state: the hero demonstration does not occupy the content width and has no pi panel.

- [ ] **Step 2: Add the responsive hero composition and decorative panel**

In `apps/web/src/pages/index.astro`, wrap the existing transcript in `.hero-demo` and add the panel as its sibling. Keep every byte of the current transcript body content unchanged:

```astro
<div class="hero-demo">
  <div class="transcript">
    <!-- existing transcript bar and body, unchanged -->
  </div>

  <aside class="pi-panel" aria-hidden="true">
    <div class="pi-panel-bar">
      <span>◇</span><span>oh my pi</span>
    </div>
    <div class="pi-field">
      <pre class="pi-mark">██████████████
   ███    ███
   ███    ███
   ███    ███
          ███
          ███</pre>
    </div>
  </aside>
</div>
```

The top cap is continuous, the left stem stops after three rows, and the right stem continues two rows lower. Do not add screen-reader-only duplication; the transcript already communicates the workflow.

- [ ] **Step 3: Implement the desktop grid and aligned terminal chrome**

In `global.css`, move the demonstration's top margin to the wrapper and let the transcript fill its grid column:

```css
.hero-demo {
  display: grid;
  grid-template-columns: minmax(0, 2fr) minmax(15rem, 1fr);
  gap: 1rem;
  align-items: stretch;
  margin-top: 1.75rem;
}

.transcript {
  max-width: none;
  height: 100%;
  margin-top: 0;
}

.pi-panel {
  min-width: 0;
  overflow: hidden;
  font-family: var(--font-mono);
  background: var(--bg-panel);
  border: 1px solid var(--line);
  border-radius: var(--radius);
}

.pi-panel-bar {
  display: flex;
  gap: 0.5rem;
  align-items: center;
  padding: 0.45rem 0.75rem;
  color: var(--fg-mute);
  background: var(--bg-raised);
  border-bottom: 1px solid var(--line);
}

.pi-panel-bar span:first-child {
  color: #b8b8b8;
}
```

The panel must match the transcript's border, title-bar height, surface, and radius rather than introducing a new card style.

- [ ] **Step 4: Draw the grayscale texture and animated pi**

Add:

```css
.pi-field {
  position: relative;
  display: grid;
  min-height: 10rem;
  overflow: hidden;
  place-items: center;
  isolation: isolate;
}

.pi-field::before {
  position: absolute;
  inset: -8px;
  z-index: -2;
  content: "";
  background-image:
    linear-gradient(rgb(255 255 255 / 5%) 1px, transparent 1px),
    linear-gradient(90deg, rgb(255 255 255 / 5%) 1px, transparent 1px),
    radial-gradient(circle, rgb(255 255 255 / 12%) 0.7px, transparent 0.8px);
  background-position: 0 0, 0 0, 0 0;
  background-size: 28px 28px, 28px 28px, 5px 5px;
  opacity: 0.75;
  animation: pi-texture-drift 14s linear infinite alternate;
}

.pi-field::after {
  position: absolute;
  inset: 0;
  z-index: -1;
  content: "";
  background: radial-gradient(circle at 50% 45%, rgb(255 255 255 / 6%), transparent 66%);
}

.pi-mark {
  position: relative;
  margin: 0;
  font-size: clamp(0.72rem, 1.05vw, 0.95rem);
  line-height: 0.9;
  letter-spacing: -0.08em;
  white-space: pre;
  color: transparent;
  background: linear-gradient(
    110deg,
    #555 0%,
    #8a8a8a 28%,
    #f2f2f2 46%,
    #aaa 60%,
    #626262 100%
  );
  background-clip: text;
  background-position: 100% 50%;
  background-size: 220% 100%;
  filter: drop-shadow(0 0 12px rgb(255 255 255 / 10%));
  animation: pi-luminance-scan 7s ease-in-out infinite alternate;
  -webkit-background-clip: text;
}

@keyframes pi-luminance-scan {
  to {
    background-position: 0 50%;
  }
}

@keyframes pi-texture-drift {
  to {
    transform: translate3d(6px, 4px, 0);
  }
}
```

If browser inspection shows the exact font metrics make the mark too small or clip it, adjust only `font-size`, `line-height`, `letter-spacing`, or `.pi-field` padding. Preserve the six-row silhouette and grayscale palette.

- [ ] **Step 5: Add responsive and reduced-motion behavior**

Inside the existing `@media (max-width: 900px)` block add:

```css
.hero-demo {
  grid-template-columns: minmax(0, 1fr);
}

.pi-panel {
  display: none;
}
```

Inside the existing reduced-motion block, before the universal rule, add:

```css
.pi-mark,
.pi-field::before {
  animation: none;
}
```

The universal reduced-motion fallback stays in place. Do not hide the desktop pi under reduced motion.

- [ ] **Step 6: Verify desktop layout and motion in Chromium**

Open `/` at `1440 × 1000` and verify from the rendered page and screenshot:

- the two panels span the hero content width;
- title bars and bottom edges align;
- the pi reads as the reference silhouette;
- its field is strictly grayscale;
- luminance and texture move slowly without layout shift;
- the profile index remains below the hero without overlap.

Inspect computed styles at two moments at least one second apart and confirm the pi `background-position` or texture transform changes while the panel's bounding box remains identical.

- [ ] **Step 7: Verify responsive, reduced-motion, console, and accessibility behavior**

Using the same Chromium diagnostics session:

1. resize to `900 × 900`; verify `.pi-panel` computes to `display: none` and `.transcript` fills `.hero-demo`;
2. resize to `390 × 844`; verify no horizontal overflow and all transcript commands remain readable/wrapped;
3. emulate `prefers-reduced-motion: reduce` at desktop width; verify `.pi-mark` and `.pi-field::before` report `animation-name: none` while the pi remains visible;
4. inspect console messages and confirm no runtime errors;
5. inspect the accessibility snapshot and confirm `oh my pi` and the block-character rows are absent.

Save desktop and mobile screenshots as verification evidence; do not add them to git.

- [ ] **Step 8: Run focused web checks**

Run:

```bash
bun run lint
bun run --filter=@oompf/web typecheck
bun run --filter=@oompf/web build
```

Expected: formatting/lint, web typecheck, and production build pass.

- [ ] **Step 9: Self-review and commit the isolated UI slice**

Check the diff for unchanged hero/transcript copy, no hue values in the pi selectors, no client script, no added package, and no modifications outside `index.astro` and `global.css`. Then commit:

```bash
git add apps/web/src/pages/index.astro apps/web/src/styles/global.css
git commit -m "feat(web): add ASCII pi landing motion"
```

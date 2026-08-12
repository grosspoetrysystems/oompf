# Profile detail redesign

Date: 2026-08-12
Status: Approved

## Problem

The current profile detail page renders every major fact as a full-width section. Four models consume four rows, Behavior can squeeze four dense cards into one row, providers and provenance are separated from the title and primary action, aliases receive a dedicated panel despite being an OMP convention, and an empty Requirements section explains that nothing is required. The result is long, repetitive, and difficult to scan.

## Approved information architecture

The page keeps this order:

1. Profile title, validation/version badges, author metadata, summary, tags, and curated author links.
2. A compact context strip with Providers and Source groups.
3. The install command.
4. Models.
5. Behavior, when behavior facts exist.
6. Requirements, only when actionable non-provider requirements exist.
7. Warnings, when validation warnings exist.

The old standalone Providers section, OMP aliases section, and bottom Source & provenance accordion are removed.

## Context strip

The strip sits directly below the profile header and uses at most two columns:

- Providers: linked provider chips inferred from the profile's concrete model selectors.
- Source: canonical GitHub source, pinned revision when available, last-indexed date when available, and a shortened SHA-256 fingerprint whose full value remains available and copyable.

All canonical source and revision destinations remain direct links. Missing optional values are omitted instead of replaced with empty-state copy. On narrow screens the two groups stack.

## Models

Models render in a grid with at most two columns. Each compact item contains:

- a friendly model name, linked directly to its curated model destination when one exists;
- the exact OMP selector beneath it;
- an explicit thinking-effort badge when the selector carries a recognized OMP thinking suffix.

Model selector parsing must follow OMP's suffix semantics rather than splitting every colon. Unambiguous OMP thinking suffixes (`inherit`, `off`, `minimal`, `low`, `medium`, `high`, and `xhigh`, including OMP's unambiguous abbreviations) are separated from the base selector. Guarded `max` and `auto` suffixes are separated only when OOMPF can establish that the full value is not a literal model ID; otherwise the exact selector remains unsplit. Literal model tags such as `ollama/qwen3.6:latest` and `glm-4.7:max` remain part of the model ID unless that evidence exists. OOMPF must not invent an effort for an ambiguous or suffix-free selector.

## Behavior

Behavior cards render in a grid with at most two columns. The layout must not use `auto-fit` to produce three or four narrow cards.

Model Roles and Fallback Chains use friendly model names to reduce repeated provider/model noise. Their exact selectors remain visible and authoritative in Models. A recognized selector effort renders beside the friendly name as a compact thinking badge. An alias used in a behavior mapping remains contextual—for example, `@tiny` renders as `tiny role`—but aliases do not receive their own page section.

Advisor, Settings, Hooks, Extensions, and Disabled providers keep their existing conditional rendering and facts.

## Requirements

The Requirements section is rendered only when `view.requirements.length > 0`.

For the current single-file `config.yml` artifact, requirements remain limited to source-evidenced facts OOMPF already extracts:

- referenced environment variables;
- configured hooks/extensions that must exist in the local runtime;
- project overlays.

Provider access is represented in the Providers context group and is not duplicated under Requirements. OOMPF does not infer or invent custom-agent files, role definitions, or other setup assets that the published artifact does not declare.

A future multi-file profile/package format may extend an artifact manifest with included files and explicit prerequisites. That is outside this redesign; the page should naturally render those requirements if the underlying `ProfileFacts.prerequisites` contract expands later.

## Alias documentation

The Models and providers documentation remains the canonical explanation of OMP aliases. It must say that aliases are runtime role shortcuts and are not rendered as a standalone profile-page inventory.

## Responsive behavior

Desktop and tablet layouts use no more than two columns for the context strip, Models, and Behavior. Mobile layouts stack each grid to one column. Long selectors, hashes, source links, and fallback values must wrap or scroll within their own container without causing page-level horizontal overflow.

## Accessibility

- Section headings retain accessible names.
- External links retain visible text and safe `rel` values.
- The fingerprint copy control has an explicit accessible label and visible copied/failure feedback.
- Friendly names never replace the exact selector everywhere; the Models section preserves the underlying value in text.
- Color is not the only indicator for validation state or thinking effort.

## Non-goals

- No new multi-file profile/package format.
- No new requirement inference beyond current source-derived facts.
- No provider or model URL guessing.
- No changes to the install command or collision behavior.
- No site-wide visual redesign.
- No changes to OMP's alias or thinking semantics.

## Acceptance criteria

1. A four-model profile renders Models in two columns at desktop width and one column at mobile width.
2. Behavior renders no more than two cards per row and stacks on mobile.
3. Providers, source, revision, index date, and fingerprint appear near the title rather than in separate/bottom sections.
4. The standalone OMP aliases panel is absent.
5. An empty Requirements section is absent; a non-empty one still renders every actionable requirement.
6. Known effort suffixes are displayed separately without misclassifying literal model tags such as `:latest`.
7. Behavior model references use friendly names while Models preserve exact selectors.
8. The profile has no page-level horizontal overflow at 390px and 1568px widths.
9. Existing install-copy behavior, warnings, curated links, and validation/version badges continue to work.

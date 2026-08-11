---
title: Profile format
summary: The native OMP YAML fields OOMPF reads, with an annotated example.
section: Profiles
order: 2
---

# Profile format

A profile is native OMP YAML. OOMPF reads it to extract facts; it never rewrites
or reinterprets the runtime meaning of these fields. The example below shows the
fields OOMPF recognizes. Any field OOMPF does not recognize is preserved and
reported as an unknown key for forward compatibility.

```yaml
name: atlas
version: "1.4.0"

modelRoles:
  primary: anthropic/claude-opus
  helper: openai/gpt-4o-mini

retry:
  fallbackChains:
    primary:
      - anthropic/claude-opus
      - openai/gpt-4o

advisor:
  enabled: true

hooks:
  - lint-guard

extensions:
  - repo-context

# Optional OOMPF metadata block (ignored by the OMP runtime)
oompf:
  summary: "A low-cost coding profile for Kimi and GLM."
  kind: coding
  tags:
    - kimi
    - low-cost
```

## Fields OOMPF extracts

- `name`, `version`, and other recognized scalar identity fields.
- `modelRoles` — split into role/model assignments; single models and fallback
  lists are separated.
- `retry.fallbackChains` — ordered fallback lists per role.
- `advisor` — observed advisor settings.
- `hooks`, `extensions` — collected names.
- Model selectors anywhere in the document — collected into **models**, with
  **providers** inferred from the `<provider>/<model>` prefix.
- Values beginning with `@` (for example `@tiny`) — classified as **aliases**,
  not concrete models.

## The optional `oompf` block

The `oompf` key is namespaced and optional. OMP ignores it at runtime, so adding
it never changes installation behavior. OOMPF validates and indexes it separately.
See [Metadata and summaries](/docs/metadata-and-summaries).

## Validation

OOMPF validates the artifact **structurally** and scans for secrets. It records a
`valid`/`invalid` verdict plus value-free advisories. Canonical bytes and any
secret values are never stored. See
[Provenance and revisions](/docs/provenance-and-revisions).

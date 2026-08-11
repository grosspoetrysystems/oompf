---
title: Metadata and summaries
summary: The optional namespaced `oompf` block — summary, kind, tags, and links.
section: Profiles
order: 3
---

# Metadata and summaries

Authors can add an optional, namespaced `oompf` block to the canonical YAML to
give a profile human context. The block is **not** native OMP configuration: OMP
ignores it at runtime, so it never affects installation. OOMPF validates and
indexes it separately from native OMP facts.

```yaml
oompf:
  summary: "A low-cost coding profile for Kimi and GLM."
  kind: coding
  tags:
    - kimi
    - low-cost
  links:
    - label: "Author notes"
      url: "https://example.com/notes"
```

## Fields

- **`summary`** — optional plain text, length-limited, rendered as
  author-provided content. Displayed verbatim; not interpreted.
- **`kind`** — a single value. Standard kinds are `budget`, `coding`,
  `experimental`, `general`, `local`, `research`, and `writing`. A short custom
  value is accepted as a fallback and marked as uncontrolled.
- **`tags`** — optional, normalized, length-limited strings.
- **`links`** — optional publisher-provided links (`label`, `url`). OOMPF renders
  exactly what the author declared and **never guesses** a link.

## Why not YAML comments?

Ordinary YAML comments are not used as metadata because parsers normally discard
them. The `oompf` block is a real, parseable key, so it survives round-trips and
can be validated.

## How OOMPF uses it

The `summary`, `kind`, and `tags` appear in search results and on the profile
page header. They are indexed for search. They do not change any native OMP fact
or the install flow. See [Models and providers](/docs/models-and-providers) for
the separate, derived display facts.

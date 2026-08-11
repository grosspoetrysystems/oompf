---
title: Models and providers
summary: Friendly-first model display, alias classification, and curated links.
section: Profiles
order: 4
---

# Models and providers

OOMPF presents models **friendly-first**: a readable name, then the exact
selector, then a verified link where one is curated.

```text
Kimi K2.7 Code
opencode-go/kimi-k2.7-code
Open provider page ↗
```

The exact selector stays visible as secondary, copyable reference text so nothing
is hidden behind an abstraction.

## Aliases are not models

Values beginning with `@` — such as `@tiny` — are OMP **aliases**: runtime
shortcuts that resolve to a concrete model when `omp` runs. OOMPF classifies them
separately and shows them as OMP shortcuts, never as concrete models or providers.

## Curated links, never guessed

OMP catalog data supplies provider IDs, display labels, bundled model IDs,
defaults, and capabilities. It does **not** reliably supply canonical public
documentation URLs, and provider API/base URLs are not public documentation.

OOMPF therefore maintains a small, explicit, curated registry keyed by provider
and optional model pattern. Entries contain verified public destinations. When an
identifier is not in the registry it stays valid data with **no link** — OOMPF
never fabricates a URL.

## Machine-readable mappings

The curated registry is available to agents:

- [`GET /api/v1/mappings/providers`](/api/v1/mappings/providers) — provider
  identities and canonical links.
- `GET /api/v1/mappings/models/:provider` — curated model patterns, friendly
  names, and canonical links for one provider.

Response shapes are published as JSON Schema at
[`/schemas/profile-mappings.json`](/schemas/profile-mappings.json). Unknown
providers return a `not_found` error envelope; curated models with no verified
destination carry `url: null`.

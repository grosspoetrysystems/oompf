---
title: OMP profiles
summary: What a profile is, what it configures, and where the runtime authority lives.
section: Profiles
order: 1
---

# OMP profiles

An **OMP profile** is a single YAML artifact that configures an OMP setup. It
declares the models an agent may use, how those models map to roles, provider
settings, fallback behavior, advisors, hooks, and extensions. A profile is
portable: the same YAML installs the same configuration wherever `omp` runs.

OOMPF indexes and explains profiles so they can be shared and understood. It does
**not** re-implement or override OMP runtime behavior. For the authoritative and
complete description of every field and command, follow the upstream OMP
documentation linked from these pages.

## What a profile typically contains

- **Models** — concrete `<provider>/<model>` selectors the setup uses.
- **Model roles** — which model fills a role (for example a primary vs. a small
  helper model).
- **Fallback chains** — ordered lists tried when a model is unavailable.
- **Providers** — inferred from the model selectors.
- **Advisor** — advisor settings such as enablement and subagents.
- **Hooks and extensions** — named integrations the setup loads.
- **Aliases** — OMP shortcuts such as `@tiny` that resolve at runtime.

## Facts vs. metadata

OOMPF separates three categories when it presents a profile:

1. **Native OMP facts** — extracted from the artifact (models, roles, providers,
   advisors, fallbacks, hooks, extensions, prerequisites).
2. **OOMPF metadata** — the optional publisher-authored `oompf` block
   (`summary`, `kind`, `tags`, `links`). See
   [Metadata and summaries](/docs/metadata-and-summaries).
3. **Derived display facts** — friendly model names, alias classification, and
   verified provider/model links. See
   [Models and providers](/docs/models-and-providers).

Continue with the [Profile format](/docs/profile-format).

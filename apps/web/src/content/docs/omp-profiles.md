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
documentation: the [profile layout](https://github.com/can1357/oh-my-pi/blob/main/docs/config-usage#profiles),
[models](https://github.com/can1357/oh-my-pi/blob/main/docs/models#model-and-provider-configuration-modelsyml-modelsyaml),
and [settings](https://github.com/can1357/oh-my-pi/blob/main/docs/settings#settings-catalog)
chapters linked from these pages.

## What a profile typically contains

- **Models** — concrete `<provider>/<model>` selectors the setup uses.
  ([upstream](https://github.com/can1357/oh-my-pi/blob/main/docs/models))
- **Model roles** — which model fills a role (for example a primary vs. a small
  helper model).
- **Fallback chains** — ordered lists tried when a model is unavailable.
  ([upstream: retry and fallback](https://github.com/can1357/oh-my-pi/blob/main/docs/settings#retry-and-fallback))
- **Providers** — inferred from the model selectors.
  ([upstream](https://github.com/can1357/oh-my-pi/blob/main/docs/providers))
- **Advisor** — advisor settings such as enablement and subagents.
  ([upstream](https://github.com/can1357/oh-my-pi/blob/main/docs/advisor-watchdog))
- **Hooks and extensions** — named integrations the setup loads.
  ([hooks](https://github.com/can1357/oh-my-pi/blob/main/docs/hooks),
  [extensions](https://github.com/can1357/oh-my-pi/blob/main/docs/extensions))
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

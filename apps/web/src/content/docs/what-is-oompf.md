---
title: What is OOMPF?
summary: The public index and authority for sharing, inspecting, and installing OMP profiles.
section: Introduction
order: 1
---

# What is OOMPF?

OOMPF is the public index for **OMP (Oh My Pi) profiles**. A profile is a single
YAML artifact that configures an OMP setup — its models, model roles, providers,
fallbacks, advisors, hooks, and extensions. OOMPF lets you publish a profile as a
public GitHub Gist, register it once, and then discover, inspect, and install it
anywhere `omp` runs.

OOMPF is the **authority for sharing and understanding** profiles. OMP itself
remains the authority for the runtime: the complete `omp` command surface and all
execution behavior live with OMP. OOMPF documents only the profile concepts you
need to share and use a configuration, and links to upstream OMP documentation for
everything else.

## What OOMPF stores

OOMPF stores **metadata only** — never the canonical YAML. The source of truth is
always the public Gist. For each registered profile OOMPF keeps:

- source-derived **facts** (models, providers, roles, fallbacks, advisors, hooks,
  extensions, prerequisites, and OMP aliases);
- **structural validation** results and value-free secret advisories;
- publisher-curated **OOMPF metadata** (`summary`, `kind`, `tags`, `links`);
- **provenance** — the canonical source URL, the pinned revision, and a SHA-256
  content fingerprint.

## The workflow

```text
publish -> inspect -> search -> add
```

You publish a local profile to a Gist, OOMPF indexes its metadata, anyone can
search and inspect it, and installing it uses the canonical OOMPF URL:

```text
oompf add https://oompf.run/p/<id>
```

See [Getting started](/docs/getting-started) to run the flow end to end.

## Agent-facing surfaces

OOMPF is designed to be consumed without scraping HTML. Machine-readable indexes
live at [`/llms.txt`](/llms.txt) and [`/docs/llms.txt`](/docs/llms.txt), the API is
described by [`/openapi.json`](/openapi.json), and response shapes are published as
JSON Schema. See [CLI reference](/docs/cli-reference) and the API reference for the
canonical `/api/v1` routes.

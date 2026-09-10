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

## What OOMPF is not

- **Not a registry you have to publish to.** A profile is valid wherever it
  lives. OOMPF indexes public Gists that people chose to share, and nothing
  about a profile depends on being listed here.
- **Not a package manager.** There is no dependency resolution, no lockfile, and
  no version range. `oompf add` verifies a fingerprint and writes one file.
- **Not an authority on OMP's semantics.** OMP defines what a setting does and
  how it behaves once the profile is installed. Where this site's description
  and OMP's own documentation disagree, OMP is right.
- **Not a host.** The canonical bytes live in the Gist. Delete it and the
  profile is gone; the index row stays and is flagged unreachable after repeated
  failed checks, because a 404 is what a deleted Gist and a newly private one
  both look like. See
  [Provenance and revisions](/docs/provenance-and-revisions).

## The name, and the format that does not exist yet

The name expands to Open OMP Format. There is no OOMPF format. What exists is:

- the canonical artifact, an **OMP** `config.yml`, defined by OMP;
- exactly one convention OOMPF contributes inside that file — the namespaced
  [`oompf:` metadata block](/docs/metadata-and-summaries) carrying `summary`,
  `kind`, `tags`, and `links`, which the OMP runtime ignores;
- an index over the rest: derived facts, validation results, provenance, and the
  stable `/p/<id>` reference.

A shared index over someone else's format, plus a small metadata convention
living inside it. That is a useful thing to be, and it is not a format.

> **Speculation, September 2026 — not a roadmap and not a commitment.** Two
> directions are open and neither is built. The near one costs nothing: push
> OMP's existing YAML surface as far as it goes and let shareable-artifact
> conventions grow inside the `oompf:` block. The far one is the interesting
> one — whether the genuinely portable part of a profile, the strategy rather
> than the mechanism (role assignments, economic tier, thinking level, fallback
> chains), could be expressed harness-neutrally and adopted by agents other
> than OMP. That is an open question, not a plan, and nothing here answers it
> yet. Inventing a schema before a convention has proved itself would fragment
> a format that already works, so the name stays aspirational on purpose until
> one earns it.

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

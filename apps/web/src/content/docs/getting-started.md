---
title: Getting started
summary: Install the CLI, publish a profile, and install one by its OOMPF URL.
section: Introduction
order: 2
---

# Getting started

This walkthrough runs the full OOMPF workflow: publish a local profile, find it in
the index, and install it on another machine.

## Prerequisites

- A working OMP install (`omp`) for producing and consuming profiles.
- The `oompf` CLI (run from source with `bun apps/cli/src/index.ts <command>` in
  this repository).
- A GitHub account for publishing a public Gist.

The CLI targets `https://oompf.run` by default. Override it with `OOMPF_BASE_URL`
for local development (usually `http://localhost:4321`).

## 1. Publish a profile

```bash
oompf publish ./my-profile.yaml
```

`publish` validates the artifact locally, creates a public Gist, and registers its
metadata with OOMPF. It prints the canonical profile URL.

## 2. Search the index

```bash
oompf search "kimi low-cost"
```

Search returns compact summaries — name, models, providers, and the author's
`summary`/`kind`/`tags` — each with a canonical OOMPF URL.

## 3. Inspect before installing

```bash
oompf inspect https://oompf.run/p/<id>
```

`inspect` shows the source-derived facts, OOMPF metadata, aliases, structural
verdict, and provenance without installing anything.

## 4. Install

```bash
oompf add https://oompf.run/p/<id>
```

`add` fetches the canonical Gist, re-validates it, and installs it as a native OMP
profile. The install reference is always the canonical OOMPF URL — never the raw
Gist URL.

Next: read [OMP profiles](/docs/omp-profiles) and the [Profile format](/docs/profile-format).

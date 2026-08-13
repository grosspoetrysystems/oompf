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

- A working OMP install (`omp`) for producing and consuming profiles. `publish`
  and `add` ask OMP where profiles live rather than assuming a path.
- A GitHub account with the GitHub CLI (`gh`) authenticated, for publishing.
- Node 22 or newer, or Bun.

## Install the CLI

`oompf` is a command you run in a terminal, so install it globally:

```bash
npm install -g @grosspoetrysystems/oompf
```

Or run it without installing anything, which fetches it per invocation:

```bash
bunx @grosspoetrysystems/oompf@latest --help
npx @grosspoetrysystems/oompf@latest --help
```

The package name is scoped; the command is plain `oompf`. Every example below
uses the command name.

Do not install it as a project dependency. A plain `npm install
@grosspoetrysystems/oompf` puts the binary in `node_modules/.bin`, which is not
on your `PATH`, so `oompf` will not be found — and inside a repository that uses
the `workspace:` protocol, npm fails outright. Use `-g` or `bunx`.

Working in a clone of this repository instead? Run it from source with
`bun apps/cli/src/index.ts <command>`.

The CLI targets `https://oompf.run` by default. Override it with `OOMPF_BASE_URL`
for local development (usually `http://localhost:4321`).

## 1. Publish a profile

```bash
oompf publish work
```

`work` is a native OMP profile name, the same name you use with `omp --profile
work`. OOMPF validates the artifact locally, creates a public Gist, and registers
its metadata. It prints the canonical profile URL. The argument may be omitted;
OOMPF then auto-selects a single profile or opens an interactive selector.

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

For an OOMPF URL or id, `add` fetches the exact Gist revision that OOMPF indexed,
re-validates it, and refuses to write the profile unless its SHA-256 fingerprint
matches the index. The installed source cannot silently follow later Gist edits.
Direct Gist references are supported separately, but have no indexed fingerprint
to verify.

Next: read [OMP profiles](/docs/omp-profiles) and the [Profile format](/docs/profile-format).

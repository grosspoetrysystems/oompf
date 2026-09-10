---
title: CLI reference
summary: Syntax, examples, output, and failure modes for oompf publish, inspect, search, add, and upgrade.
section: Reference
order: 1
---

# CLI reference

The `oompf` CLI drives the full workflow. Install it on your `PATH` with
`npm install -g @grosspoetrysystems/oompf`, or run it per invocation with
`bunx @grosspoetrysystems/oompf@latest`. The package name is scoped; the command
is plain `oompf`. See [Getting started](/docs/getting-started) for prerequisites
and why a project-local install is the wrong shape for a `PATH` command.

It targets `https://oompf.run` by default; set `OOMPF_BASE_URL` (for example
`http://localhost:4321`) to point at a local instance. Every command prints a
stable error envelope on failure — a machine-readable `code`, a human
`message`, and optional value-free `details`.

The CLI uses the canonical `/api/v1` routes for indexed metadata and registration.
`upgrade` also patches the owned source Gist through GitHub after confirmation.
Response shapes are described by [`/openapi.json`](/openapi.json) and the
published JSON Schemas.

## `oompf publish`

Publish a native OMP profile to a public Gist and register its metadata.

```bash
oompf publish work
```

- **Syntax:** `oompf publish [profile]`, where `profile` is a native OMP profile name.
- **Agent runtime:** `--agent <omp|pi>` selects the runtime binary (default
  `omp`). When omitted, the sole installed runtime is used automatically; OMP
  wins when both are installed.
- **Output:** the canonical profile URL, `https://oompf.run/p/<id>`, and
  `publication: created | updated`.
- **Repeat publish:** publishing the same profile again patches the Gist it was
  first published to, so `/p/<id>` stays stable while the revision and
  fingerprint change. The mapping lives in `~/.oompf/publications.json`; `--new`
  publishes a separate Gist instead. A patched Gist takes a few seconds to
  become readable, so the command waits for the index to hold the bytes it just
  wrote and reports `index_update_failed` rather than claiming a stale link is
  current — the Gist is already patched, so publishing again resolves it.
- **Omitted input:** When the name is omitted, OOMPF automatically uses the sole
  publishable profile. With multiple profiles it opens a selector only in an
  interactive terminal; `--json`, CI, and piped execution return
  `ambiguous_profile` instead of prompting.
- **Local failure modes:** `invalid_profile`, `profile_not_found`,
  `missing_config`, `no_profile`, `ambiguous_profile`, and
  `selection_cancelled`, plus structural validation and blocking-secret errors.
- **Remote failure modes:** GitHub authentication/creation failure, or
  registration failure; `missing_gist` or `unowned_gist` when the remembered
  Gist is gone or belongs to another account. Nothing is registered if local
  validation fails.

## `oompf inspect`

Show a profile's facts, OOMPF metadata, aliases, structural verdict, and
provenance without installing anything.

```bash
oompf inspect https://oompf.run/p/<id>
oompf inspect prof_1b7c9e0a4d2f3a5b6c8d9e0f1a2b3c4d
```

- **Syntax:** `oompf inspect <oompf-url-or-id>`
- **Output:** the profile metadata record — models (friendly name + exact
  selector), providers, OMP aliases, behavior, actionable requirements, and
  provenance. JSON output includes the `oompf` metadata and `aliases`.
- **Failure modes:** `not_found` for an unknown id; a network error when the index
  is unreachable.

## `oompf search`

Free-text search over the index.

```bash
oompf search "kimi low-cost"
```

- **Syntax:** `oompf search <query>`
- **Output:** compact summaries — name, models, providers, the author's
  `summary`/`kind`/`tags`, structural verdict, and a canonical OOMPF URL.
- **Failure modes:** a network error when the index is unreachable. An empty query
  returns no results.

## `oompf add`

Install a shared profile by its canonical OOMPF URL.

```bash
oompf add https://oompf.run/p/<id>
```

- **Syntax:** `oompf add <oompf-url-or-id>`
- **Agent runtime:** `--agent <omp|pi>` selects the runtime binary (default
  `omp`). When omitted, the sole installed runtime is used automatically; OMP
  wins when both are installed.
- **Safe install:** OOMPF resolves the id, fetches the canonical Gist,
  re-validates it structurally and for secrets, verifies the SHA-256 fingerprint,
  and only then installs a native OMP profile. It installs nothing on failure.
- **Output:** confirmation of the installed profile name.
- **Failure modes:** `not_found`, unreachable source, validation failure, or a
  fingerprint mismatch.

## `oompf upgrade`

Review and optionally apply explicit model successors to an indexed profile.
Preview is read-only; the command changes a source only after confirmation.

```bash
oompf upgrade https://oompf.run/p/<id>
oompf upgrade prof_1b7c9e0a4d2f3a5b6c8d9e0f1a2b3c4d --yes
```

- **Syntax:** `oompf upgrade <oompf-url-or-id>`.
- **Preview:** the default behavior fetches the source Gist's current head,
  reports the catalog revision, and shows each explicit model successor plus
  unchanged selectors and reasons. Preview performs no writes; `--json` is
  suitable for automation.
- **Confirmation:** use `--yes` for a non-interactive confirmed update. The
  command verifies GitHub ownership, validates the transformed YAML, patches the
  existing public Gist in place, and re-registers the same source URL. The
  `/p/<id>` identity therefore stays stable while its revision and fingerprint
  change.
- **Safety:** the indexed pinned revision is provenance only; the current Gist
  head is the patch input. A head change during review aborts instead of
  overwriting the newer edit. Unknown models, missing successors, and
  incompatible slots remain unchanged.
- **Failure modes:** `invalid_ref`, `unverifiable_artifact`, `unowned_gist`,
  `head_changed`, `invalid_artifact`, `blocking_secrets`, GitHub patch failure,
  or `index_update_failed`. If the Gist patch succeeds but registration fails,
  the command reports the partial state and never claims success.


## Corresponding API routes

| Command | Canonical route | Compatibility alias |
| --- | --- | --- |
| `publish` | `POST /api/v1/profiles` | `POST /api/profiles` |
| `inspect` | `GET /api/v1/profiles/:id` | `GET /api/profiles/:id` |
| `search` | `GET /api/v1/search` | `GET /api/search` |
| `upgrade` | `GET /api/v1/profiles/:id`, `POST /api/v1/profiles`, and owned GitHub Gist `PATCH` | `GET/POST /api/profiles...` |
| mappings | `GET /api/v1/mappings/providers`, `GET /api/v1/mappings/models/:provider` | `GET /api/mappings/...` |

The complete `omp` command surface and runtime behavior are documented by OMP
upstream; OOMPF documents only the commands above.

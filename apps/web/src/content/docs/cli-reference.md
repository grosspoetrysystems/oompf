---
title: CLI reference
summary: Syntax, examples, output, and failure modes for oompf publish, inspect, search, and add.
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

The CLI is a thin client over the canonical `/api/v1` routes. Response shapes are
described by [`/openapi.json`](/openapi.json) and the published JSON Schemas.

## `oompf publish`

Publish a local profile to a public Gist and register its metadata.

```bash
oompf publish ./my-profile.yaml
```

- **Syntax:** `oompf publish <path>`
- **Output:** the canonical profile URL, `https://oompf.run/p/<id>`.
- **Failure modes:** local validation failure (structural or blocking secret),
  GitHub authentication/creation failure, or registration failure. Nothing is
  registered if local validation fails.

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
- **Safe install:** OOMPF resolves the id, fetches the canonical Gist,
  re-validates it structurally and for secrets, verifies the SHA-256 fingerprint,
  and only then installs a native OMP profile. It installs nothing on failure.
- **Output:** confirmation of the installed profile name.
- **Failure modes:** `not_found`, unreachable source, validation failure, or a
  fingerprint mismatch.

## Corresponding API routes

| Command | Canonical route | Compatibility alias |
| --- | --- | --- |
| `publish` | `POST /api/v1/profiles` | `POST /api/profiles` |
| `inspect` | `GET /api/v1/profiles/:id` | `GET /api/profiles/:id` |
| `search` | `GET /api/v1/search` | `GET /api/search` |
| mappings | `GET /api/v1/mappings/providers`, `GET /api/v1/mappings/models/:provider` | `GET /api/mappings/...` |

The complete `omp` command surface and runtime behavior are documented by OMP
upstream; OOMPF documents only the commands above.

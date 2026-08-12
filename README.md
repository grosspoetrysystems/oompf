# OOMPF

OOMPF (Open OMP Format) is an open index for sharing, inspecting, searching, and
installing reproducible [OMP](https://oh-my-pi.dev) (Oh My Pi) agent profiles.

Live site: [https://oompf.run](https://oompf.run)

## How it works

```text
local OMP profile
  → public GitHub Gist
  → OOMPF metadata index
  → inspect / search
  → install as a native OMP profile
  → omp --profile <name>
```

The canonical profile artifact always stays at its public Gist. OOMPF persists
and serves **metadata only** — source, revision, facts, validation results, and
publisher metadata. Every shared profile gets an opaque reference:

```text
https://oompf.run/p/<id>
```

## Repository layout

| Path | Contents |
| --- | --- |
| `apps/cli` | The `oompf` CLI — `publish`, `add`, `inspect`, `search`. Ships as the npm package `oompf`. |
| `apps/web` | Astro web app deployed to Cloudflare Workers — profile pages, docs, and the `/api/v1` index. |
| `packages/core` | Profile discovery, YAML parsing, validation, facts, metadata, provider links, and content hashing. |
| `packages/github` | GitHub CLI (`gh`) integration and public Gist fetching. |
| `packages/database` | Drizzle schema, migrations, and the metadata repository. |
| `scripts` | Local wrappers and smoke tooling. |

## Documentation

- Site docs: [https://oompf.run/docs/](https://oompf.run/docs/)
- OpenAPI spec: [https://oompf.run/openapi.json](https://oompf.run/openapi.json)
- [CONTRIBUTING.md](CONTRIBUTING.md) — how to work in this repo
- [docs/architecture.md](docs/architecture.md) — system architecture

## Local setup

Requirements: Bun 1.3+, GitHub CLI (`gh`), and a Neon/Postgres database for the
indexed metadata.

```bash
bun install
cp .env.example .env.local
# Set DATABASE_URL in .env.local.
bun run db:migrate
bun run dev
```

For local CLI calls against the Astro server:

```env
OOMPF_BASE_URL=http://localhost:4321
```

`OOMPF_BASE_URL` defaults to `https://oompf.run` when omitted. `DATABASE_URL` is
loaded from `.env.local` for local commands and from the process environment in
CI. `.env.local` is ignored and must never be committed.

### Run the CLI from source

```bash
bun apps/cli/src/index.ts publish <profile>
bun apps/cli/src/index.ts inspect <ref>
bun apps/cli/src/index.ts search [query]
bun apps/cli/src/index.ts add <ref>
```

Publishing uses the authenticated GitHub CLI account to create a public Gist.
Verify authentication first:

```bash
gh auth status
```

An install reference looks like:

```bash
bun apps/cli/src/index.ts add https://oompf.run/p/<id>
```

Installs preserve the published artifact as a native OMP profile and refuse to
overwrite an existing target.

## Checks

```bash
bun run gate             # everything below, in one command

bun run lint             # Ultracite/Biome
bun run knip             # unused files, exports, and dependencies
bun run test             # Bun test suite
bun run typecheck        # Turbo workspace typecheck
bun run build            # package and Astro builds
bun run check:migrations # migration journal integrity and schema drift
bun run check:package    # published tarball contents and manifest
bun run smoke:local      # in-process publish/index/search/install flow
```

Against a deployed origin:

```bash
bun run smoke:deployed                          # production
bun run smoke:deployed http://localhost:4321    # a local instance
```

## Deployment

The web application is an Astro server deployed to Cloudflare Workers. The
metadata index uses Neon/Postgres through Drizzle. GitHub Actions deploys only
after CI succeeds and expects these repository secrets:

```text
DATABASE_URL
CLOUDFLARE_ACCOUNT_ID
CLOUDFLARE_API_TOKEN
```

`CLOUDFLARE_API_TOKEN` should be scoped to the deployment account with `Workers
Scripts: Edit` and `Account Settings: Read`. Do not place deployment credentials
in `.env.local`.

The deploy workflow runs checks, applies database migrations, and deploys
`apps/web` to the `oompf-web` Worker. The `oompf.run/*` custom domain/route is
configured in Cloudflare.

## Scope

OOMPF v0 is intentionally OMP-native. It stores source-derived metadata and
validation results; the canonical profile artifact remains at its public GitHub
source. Repositories are not a separate publishing target in v0.

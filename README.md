# OOMPF

OOMPF (Open OMP Format) shares, indexes, inspects, and installs reproducible OMP profiles.

Production site: [oompf.run](https://oompf.run)

## Workflow

```text
local OMP profile
  → public GitHub Gist
  → OOMPF metadata index
  → inspect/search
  → install as a native OMP profile
```

The canonical profile reference is an opaque OOMPF ID:

```text
https://oompf.run/p/<id>
```

## Local setup

Requirements: Bun 1.3+, GitHub CLI (`gh`), and a Neon/Postgres database for the indexed metadata.

```bash
bun install
cp .env.example .env.local
# Set DATABASE_URL in .env.local.
bun run db:migrate
bun run dev
```

For local CLI calls against the Astro server, set:

```env
OOMPF_BASE_URL=http://localhost:4321
```

`OOMPF_BASE_URL` defaults to `https://oompf.run` when omitted. `DATABASE_URL` is loaded from `.env.local` for local commands and from the process environment in CI. `.env.local` is ignored and must never be committed.

## CLI

Run the source CLI from the repository:

```bash
bun apps/cli/src/index.ts publish <profile>
bun apps/cli/src/index.ts inspect <ref>
bun apps/cli/src/index.ts search [query]
bun apps/cli/src/index.ts add <ref>
```

After the workspace CLI is linked, the equivalent command is `oompf`.

Publishing uses the authenticated GitHub CLI account to create a public Gist. Verify authentication first:

```bash
gh auth status
```

An install reference looks like:

```bash
oompf add https://oompf.run/p/<id>
```

Installs preserve the published artifact as a native OMP profile and refuse to overwrite an existing target unless an explicit target name is supplied.

## Checks

```bash
bun run test          # Bun test suite
bun run lint          # Ultracite/Biome
bun run typecheck     # Turbo workspace typecheck
bun run build         # Package and Astro builds
bun run gate          # test + lint + typecheck + build
bun run smoke:local   # publish/index/search/install local smoke flow
```

Vitest is configured for future Vitest-specific suites; current behavioral tests use `bun:test`.

## Deployment

The web application is an Astro server deployed to Cloudflare Workers. The metadata index uses Neon/Postgres through Drizzle. GitHub Actions deploys only after CI succeeds and expects these repository secrets:

```text
DATABASE_URL
CLOUDFLARE_ACCOUNT_ID
CLOUDFLARE_API_TOKEN
```

`CLOUDFLARE_API_TOKEN` should be scoped to the deployment account with `Workers Scripts: Edit` and `Account Settings: Read`. Do not place deployment credentials in `.env.local`.

The deploy workflow runs checks, applies database migrations, and deploys `apps/web` to the `oompf-web` Worker. The `oompf.run/*` custom domain/route is configured in Cloudflare.

## Repository layout

```text
apps/cli        Incur CLI
apps/web        Astro + Cloudflare Worker web app
packages/core   OMP discovery, validation, facts, hashing
packages/github GitHub CLI/Gist integration
packages/database Drizzle schema, repository, and migrations
scripts         Local wrappers and smoke tooling
```

## Scope

OOMPF v0 is intentionally OMP-native. It stores source-derived metadata and validation results; the canonical profile artifact remains at its public GitHub source. Repositories are not a separate publishing target in v0.

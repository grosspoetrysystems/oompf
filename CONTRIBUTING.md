# Contributing to OOMPF

This guide is for anyone with commit access who needs to get from a clean clone
to a passing gate, and for anyone who needs to change the codebase without
breaking its invariants. For how the system fits together, see
[docs/architecture.md](docs/architecture.md).

## Prerequisites

- **Bun 1.3+** (the repo pins `bun@1.3.14` as `packageManager`). The local
  runtime is Bun throughout.
- **Node 22+** — the *published* CLI (`apps/cli`) declares `engines.node: ">=22"`
  because the bundled `gh` runner uses `Promise.withResolvers`. You need Node 22
  on PATH if you run the built CLI outside Bun.
- **`gh` (GitHub CLI), authenticated** — `oompf publish` shells out to `gh` to
  create a public Gist. Verify with `gh auth status` before publishing. The
  `add`/`publish` commands also need **`omp`** on PATH, because they shell out
  to `omp --profile <name> config path` to resolve install directories. Neither
  is needed for the web app or the test suite.
- **A Neon/Postgres database** — only needed when you actually want the web
  index routes and `db:migrate` to talk to a real database. Without one, the
  dev server still boots but index routes degrade (see below).

## First-run setup

```bash
bun install
cp .env.example .env.local
# Set DATABASE_URL in .env.local (Neon pooled/serverless Postgres DSN).
bun run db:migrate
bun run dev
```

`.env.local` is loaded by the [`scripts/with-env.ts`](scripts/with-env.ts)
wrapper for local commands, and by the process environment in CI. It is
gitignored and must never be committed. `OOMPF_BASE_URL` in `.env.local`
(defaults to `https://oompf.run`) points the CLI at the local server:
`http://localhost:4321`.

Hooks are installed automatically (`bun run prepare` runs `prepare-lefthook.ts`
on install). If hooks aren't active, run `bunx lefthook install`.

## Script surface

All scripts run from the repo root.

| Command | What it does |
| --- | --- |
| `bun run test` | Runs the full Bun test suite (`bun test --path-ignore-patterns='**/dist/**'`). |
| `bun run lint` | Biome/Ultracite formatting + lint check. Fixes with `bun run lint:fix`. |
| `bun run typecheck` | Turbo `tsc -b` across the workspace. |
| `bun run build` | Turbo build: packages (tsdown + `tsc -b`) then Astro. |
| `bun run gate` | **The one-command gate before pushing.** Runs lint, knip, test, typecheck, build, both integrity checks, and the local smoke. Run this and make it green. |
| `bun run smoke:local` | In-process end-to-end smoke (`tests/e2e/oompf-flow.test.ts`) that runs the CLI against the web index service backed by PGlite: publish → index → search → inspect → install → collision → content-redaction. No network or real `gh`/`omp` needed. |
| `bun run knip` | Dead-code and unused-dependency audit. Enforced in CI, so an unreferenced export fails the build. |
| `bun run check:migrations` | Replays the journalled migration chain into an empty PGlite database and asserts the schema the repository queries. Catches a hand-written migration no runner would apply. |
| `bun run check:package` | Asserts the published tarball's exact file list, an executable JavaScript `bin`, and no `workspace:` ranges in any dependency field. `0.1.0` shipped `workspace:*` devDependencies past a guard that only read `dependencies`. |
| `bun run smoke:deployed [origin]` | HTTP smoke against a live origin (defaults to production): pages, `llms.txt`, `openapi.json`, and both `/api/v1/search` and its compatibility alias, asserting response shape rather than only status. |
| `bun run smoke:published [version]` | Installs the *published* package from npm into a throwaway directory and runs the binary, asserting it reports the expected version. Defaults to the version in `apps/cli/package.json`. Uses a fresh npm cache per attempt and waits minutes, because a new version is not immediately readable and npm caches the packument it first saw. |
| `bun run db:migrate` | Applies committed migrations to the database in `DATABASE_URL` via `drizzle-kit migrate`. |
| `bun run dev` | Starts the Astro dev server (`apps/web`). |

CI runs two jobs. **Verify** mirrors the gate. **Distribution** builds, checks
the package manifest, then installs the packed tarball into an empty directory
and runs the binary under Node 22 and 24 — because the CLI shipped a `bun`
shebang and Bun-only spawn calls once, and a Bun-only CI could not see it.

Deploys additionally run `check:migrations` before touching the database and
`smoke:deployed` after the Worker upload, so a release that leaves the index
returning 500 fails the workflow instead of reporting success.

### One test, one name

Run a single test file:

```bash
bun test packages/core/src/validation.test.ts
```

Run a single test by name within a file (`-t` filters on the test name):

```bash
bun test packages/core/src/validation.test.ts -t "blocks"
bun test packages/core/src/validation.test.ts -t "does not invent links"
```

The package-scoped equivalent inside a workspace is `bun test <path>` from that
package, or `bun run test` from a package that defines a `test` script (e.g.
`packages/core`, `packages/database`, `apps/cli`).

## Local web development

- `bun run dev` boots Astro on an IPv6 localhost. Use
  **`http://localhost:4321`**; `http://127.0.0.1:4321` will not connect.
- The dev server binds no real database by default: `DATABASE_URL` is absent
  locally, so `resolveRepository` throws `server_misconfigured` and the index
  routes return a clean `500` "profile index database is not configured"
  envelope. The `/p/<id>`, search, and register routes all degrade
  to that notice until `DATABASE_URL` is set in `.env.local` and
  `bun run db:migrate` has run. Pages that don't need the database render fine.
- To exercise the CLI against the local server, set
  `OOMPF_BASE_URL=http://localhost:4321` in `.env.local`.

## Database migrations

Migrations live in [`packages/database/migrations/`](packages/database/migrations/)
as plain SQL, and are applied by `bun run db:migrate` (which loads `.env.local`
via the `with-env` wrapper and runs the `@oompf/database` `migrate` script —
`drizzle-kit migrate` — against
[`packages/database/drizzle.config.ts`](packages/database/drizzle.config.ts)).

**A migration must be generated with `drizzle-kit generate`.** A hand-written
`.sql` file dropped into the migrations directory is applied by nothing and
caused a production outage. `drizzle-kit migrate` reads the journal in
`migrations/meta/`; a file not recorded there is never applied. To add a schema
change:

```bash
# Generate a migration from a schema change. Run inside the package so the
# local drizzle-kit bin and drizzle.config.ts resolve; this writes
# packages/database/migrations/<n>_<name>.sql and appends to the journal.
cd packages/database
bunx drizzle-kit generate

# Back at the repo root, apply it (loads DATABASE_URL from .env.local):
cd ../..
bun run db:migrate
```

Commit the generated SQL, the journal update, and the schema change together.

## Commits

Conventional commits, enforced by commitlint via lefthook:

- `commit-msg` hook runs `bunx commitlint --edit`. The config requires a
  conventional header (`feat(scope): ...`, `fix: ...`) of at most 100
  characters, and enforces `body-empty` and `footer-empty` — a commit is a
  single subject line, so put the reasoning in the code or the PR, not the
  message.
- `pre-commit` hook runs `bunx ultracite fix` on staged files and stages fixes
  (`stage_fixed: true`).

Prefixes follow `@commitlint/config-conventional` (e.g. `feat`, `fix`, `refactor`,
`chore`, `test`, `docs`). The workspace is organized so a change usually names
its package as scope, e.g. `feat(core): ...`, `fix(database): ...`.

## Releasing the CLI

The CLI publishes to npm as `@grosspoetrysystems/oompf`. Releases are cut by
pushing a tag; nothing publishes from a laptop after the first time.

```bash
bun run release              # preview: the commits, the derived bump, the tag
bun run release --yes        # bump, commit, tag, push
bun run release minor --yes  # override the derived bump
```

The version is **derived from the commits**, not typed. `feat` is a minor, `fix`
and `perf` are patches, and housekeeping (`chore`, `docs`, `ci`, `test`,
`refactor`) is not a release at all - the script refuses rather than shipping a
version with nothing in it. A breaking change (`feat!:` or a `BREAKING CHANGE:`
footer) is a major once past 1.0; below 1.0 it is a minor, because there is no
stability contract yet to break and jumping to 1.0.0 would claim one. Pass an
explicit level to override any of this.

There is one version in the repository: `apps/cli/package.json`. `CLI_VERSION`
reads it, the tag is computed from it, and the workflow re-checks that the tag
it was triggered by matches it. Preview is the default because a publish cannot
be undone after 72 hours.

Before pushing anything the script refuses to proceed unless it is on `main`,
the tree is clean, `main` and `origin/main` agree, the tag does not exist, the
version is not already on the registry, and the full gate passes. A tag that
fails the gate would otherwise leave a pushed tag with nothing published, and
the same version cannot be tagged twice.

`release.yml` then re-runs the full gate, asserts the tag matches the manifest,
refuses a version already on the registry, publishes, and finally installs the
published package from npm in a clean directory and runs it.

Authentication is npm **trusted publishing** (OIDC), so there is no `NPM_TOKEN`
in this repository — the workflow's `id-token: write` permission is what lets
npm mint a short-lived publish token, and provenance is attached automatically.

Two consequences worth knowing:

- Trusted publishing is configured per *package* on npmjs.com, so the first
  version of a new package must be published by hand (`npm login && npm publish`)
  before the workflow can take over.
- The trusted publisher config names the workflow **filename**, matched exactly.
  Renaming `release.yml` breaks publishing until the config is updated.

## Invariants you must not break

These are load-bearing guarantees. Each is backed by a test you should extend
rather than weaken.

- **Metadata-only persistence.** The index stores *facts about* and *metadata
  derived from* a canonical profile artifact — never the artifact bytes. The
  `profiles` table and the persisted `validation` JSON deliberately have no
  `content`/`yaml`/`document` column. Enforced by the `metadata-only
  persistence` suite in
  [`packages/database/src/repository.test.ts`](packages/database/src/repository.test.ts)
  (`"never stores canonical artifact content"`, which checks the row keys and
  that a `SOURCE_CANARY` comment line in the source never leaks into any stored
  column), plus a `RAW_ARTIFACT_CANARY` check in
  [`scripts/smoke-local.ts`](scripts/smoke-local.ts).

- **No-overwrite installs.** `oompf add` refuses an existing target outright —
  there is no `--force`, no clobber. Enforced in
  [`apps/cli/src/commands/add.ts`](apps/cli/src/commands/add.ts) (`target_exists`)
  and exercised by the `smoke:local` collision assertion.

- **Unknown YAML keys are preserved.** OOMPF never rewrites or strips keys it
  doesn't understand. The install writes the fetched `config.yml` bytes
  verbatim, and profile resolution keeps unknown keys. Enforced by `"preserves
  unknown keys from the config document"` in
  [`packages/core/src/omp-profile.test.ts`](packages/core/src/omp-profile.test.ts).

- **No guessed URLs.** Provider and model links are curated, not fabricated: an
  unknown provider/model resolves to `url: null` rather than an invented link.
  Enforced by `"does not invent links for unknown selectors"` in
  [`packages/core/src/provider-links.test.ts`](packages/core/src/provider-links.test.ts),
  and by the analogous wording on the `/api/v1/mappings/*` routes.

- **Secrets block before publish.** High-confidence credential findings abort
  `publish` before anything leaves the machine, and secret *values* never leak
  into errors, findings, or stored rows. Covered across
  [`packages/core/src/validation.test.ts`](packages/core/src/validation.test.ts)
  (`scanForSecrets` suite and `"high-confidence findings block and never leak the
  value"`), and the blocking path is enforced in
  [`apps/cli/src/commands/publish.ts`](apps/cli/src/commands/publish.ts)
  (`blocking_secrets`).

The one-shot gate that ties most of these together is `bun run smoke:local`,
which asserts registration shape, install path, search count, collision failure,
and both metadata and CLI redaction in a single hermetic run.

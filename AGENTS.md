# OOMPF repository guidance

## Project shape

- Runtime and package manager: Bun 1.3+.
- Workspace orchestration: Turbo.
- Web: Astro server output deployed to Cloudflare Workers.
- CLI: Bun/TypeScript with Incur.
- Shared packages: `packages/core`, `packages/github`, and `packages/database`.
- Database: Postgres via Drizzle; production uses Neon and the Worker-compatible Neon HTTP runtime.
- Public production domain: `https://oompf.run`.

## Development

```bash
bun install
cp .env.example .env.local
bun run db:migrate
bun run dev
```

Use `bun apps/cli/src/index.ts <command>` for local CLI execution. The CLI accepts `OOMPF_BASE_URL`; local development normally uses `http://localhost:4321` and production defaults to `https://oompf.run`.

`DATABASE_URL` is required for migrations and database-backed local execution. `scripts/with-env.ts` loads `.env.local` when present and preserves values already supplied by the shell or CI. Never print, log, commit, or paste secret values.

## Verification

Before claiming a change is complete, run the narrowest relevant check and then the full gate for cross-cutting changes:

```bash
bun run test
bun run lint
bun run typecheck
bun run build
bun run smoke:local
```

The combined gate is:

```bash
bun run gate
```

Behavioral tests use `bun:test`. Do not add a second test runner for existing behavior without a specific reason.

## Change boundaries

- Preserve the OOMPF v0 workflow: publish a local OMP profile to a public GitHub Gist, register metadata, inspect/search it, and install it as a native OMP profile.
- Keep the canonical profile reference as `/p/<stable-id>`. GitHub owner and source revision are metadata, not the primary OOMPF identity.
- The index stores derived metadata and validation results, not canonical profile contents or secrets.
- Keep public source URLs, revisions, hashes, and validation facts inspectable.
- Do not add authentication, accounts, repository publishing, or generalized profile-platform features without an explicit scope decision.
- Treat generated `dist/` output as build output; change source and rebuild instead of editing it.

## Secrets and deployment

Local secrets belong in `.env.local`, which is ignored. CI receives only:

```text
DATABASE_URL
CLOUDFLARE_ACCOUNT_ID
CLOUDFLARE_API_TOKEN
```

Do not request, print, or include secret values in reports, tests, fixtures, URLs, error messages, or commits. Cloudflare deployment permissions should be least-privilege for the currently configured Worker bindings.

The deploy workflow runs only for tested `main` revisions, applies migrations, and deploys `apps/web`. Do not claim production deployment until the workflow and the live `oompf.run` endpoints have been exercised.

## Commits

`main` is the integration branch. Do not rewrite published history or
force-push.

A commit message is **one line**. commitlint runs on the `commit-msg` hook and
rejects a body or a footer outright, so reasoning belongs in the code, the PR, or
the ticket — never the message. This is the rule agents break most often.

```text
<type>(<scope>): <subject>
```

| Rule | Value |
| --- | --- |
| Allowed types | `build` `chore` `ci` `docs` `feat` `fix` `perf` `refactor` `revert` `style` `test` |
| Type case | lower-case (`Feat:` is rejected) |
| Subject | lower-case start, no trailing period |
| Header length | 100 characters maximum, including type and scope |
| Body / footer | must be empty |
| Scope | optional; use the package a change belongs to (`core`, `database`, `github`, `cli`, `web`) |
| Breaking change | `feat(api)!: ...` — the `!` marker, since a `BREAKING CHANGE:` footer is not allowed here |

### Types decide the released version

`bun run release` derives the next version from the commits since the last
`cli-v*` tag, so the type is not cosmetic — it is the release input.

| Type | Effect on the next CLI release |
| --- | --- |
| `feat` | minor |
| `fix`, `perf` | patch |
| `feat!` and other `!` markers | major, or minor while the version is below 1.0 |
| everything else | nothing — a release containing only these is refused |

Labelling a bug fix `chore` therefore keeps it out of a release, and labelling
housekeeping `feat` ships a minor bump for nothing. Pick the type that describes
the change honestly; run `bun run release` (preview, no side effects) to see what
the current history would produce.

The `pre-commit` hook runs `bunx ultracite fix` on staged files and stages the
result, so files may legitimately differ after committing. Do not fight it by
hand-formatting.

## Documentation

- Preserve unrelated working-tree changes, especially `docs/research.md` unless
  explicitly asked to edit it.
- Keep the root README and this file concise, operational, and synchronized with
  actual commands and configuration. Do not create documentation files unless
  requested.
- `CONTRIBUTING.md` is the human-facing version of this material, and
  `docs/architecture.md` explains how the pieces fit together.

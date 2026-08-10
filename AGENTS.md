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

## Git and documentation

- `main` is the integration branch.
- Use focused conventional commits; do not rewrite published history or force-push.
- Preserve unrelated working-tree changes, especially `docs/research.md` unless explicitly asked to edit it.
- Keep the root README and this file concise, operational, and synchronized with actual commands/configuration. Do not create documentation files unless requested.

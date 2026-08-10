# OOMPF Bun Tooling Retrofit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Retrofit OOMPF with the non-package-manager portions of rack-mount-ts while retaining Bun for installation, scripts, runtime, and the existing Bun test suites.

**Architecture:** Keep Bun workspaces and Astro/Cloudflare/Incur/Drizzle boundaries intact. Add Turbo as the root task graph, strict shared TypeScript settings with package project references, tsdown/tsx for package development, Biome via Ultracite for formatting/linting, Vitest configuration for future v8 coverage, and root-only Lefthook/Commitlint/Knip configuration. Existing Bun tests remain the authoritative test command because the project explicitly stays on Bun.

**Tech Stack:** Bun, Turbo, TypeScript, tsdown, tsx, Biome, Ultracite, Vitest/v8, Lefthook, Commitlint, Knip, Astro, Incur, Drizzle, Cloudflare.

## Global Constraints

- Keep Bun as package manager, runtime, workspace runner, and existing test runner.
- Preserve Astro, Cloudflare, Incur, Drizzle, Neon, and GitHub integrations.
- Root-only quality tooling; package-specific dependencies remain package-local where practical.
- Do not rewrite existing `bun:test` suites to Vitest in this retrofit.
- Never commit secrets or generated build output.
- Existing full test, typecheck, build, and smoke commands must remain passing.

---

### Task 1: Root orchestration and quality tooling

**Files:**
- Modify: `package.json`
- Create: `turbo.json`
- Create: `biome.jsonc`
- Modify: `tsconfig.json`
- Create: `.gitignore` additions only if needed

**Interfaces:**
- Root scripts remain Bun-backed; Turbo invokes package scripts.
- `gate` depends on `typecheck`, `lint`, `test`, and `build`.

- [ ] Add root dev dependencies for `turbo`, `@biomejs/biome`, `ultracite`, `typescript`, `tsx`, `tsdown`, `vitest`, and `@vitest/coverage-v8` using Bun.
- [ ] Add `turbo.json` tasks with `build` depending on upstream builds and outputs `dist/**`, plus `typecheck`, `test`, `lint`, and `gate`.
- [ ] Add `biome.jsonc` extending `ultracite` and configure ignores for generated `.astro/`, `dist/`, and coverage output.
- [ ] Add root scripts that remain Bun-compatible: `lint`, `lint:fix`, `test`, `test:coverage`, `typecheck`, `build`, `gate`, and `dev`.
- [ ] Keep `bun run test` and `bun run smoke:local` behavior unchanged while exposing Turbo orchestration through `gate`.
- [ ] Ensure root TypeScript settings retain strictness, Bun/DOM types, bundler resolution, declaration output, and project references.

### Task 2: Package build and development configuration

**Files:**
- Modify: `packages/core/package.json`, `packages/github/package.json`, `packages/database/package.json`, `apps/cli/package.json`
- Create: package-local `tsdown.config.ts` only for packages that emit distributable JS
- Create: package-local `tsx` development entry configuration only where an entry exists

**Interfaces:**
- Existing package exports and CLI bin remain unchanged.
- `typecheck` continues to use `tsc -b`; `build` may use tsdown for library packages without changing runtime exports.

- [ ] Add package `build`, `typecheck`, and `test` scripts consistently.
- [ ] Add tsdown configs for core/github/database/CLI only when their current exports can be represented without changing source import behavior.
- [ ] Keep web on Astro’s build and typecheck scripts; do not route Astro through tsdown.
- [ ] Keep CLI execution on Bun and preserve `bun apps/cli/src/index.ts --help`.
- [ ] Add `tsx` as the development runner for standalone TypeScript scripts without replacing Bun runtime commands.

### Task 3: Vitest and coverage substrate

**Files:**
- Create: `vitest.config.ts`
- Create: `tests/vitest-smoke.test.ts` only if needed to prove configuration
- Modify: `package.json`

**Interfaces:**
- Vitest is an available coverage-capable secondary test harness; Bun tests remain authoritative.

- [ ] Configure Vitest with ESM, strict test discovery, v8 coverage, text/json reporters, and exclusions for `dist`, generated Astro files, and existing Bun test files.
- [ ] Add `test:vitest` and `test:coverage` scripts that do not duplicate or alter the Bun test suite.
- [ ] Add one deterministic configuration smoke test only if Vitest otherwise has no test files.
- [ ] Ensure coverage output is ignored and no secrets or profile artifacts are written.

### Task 4: Hooks, commits, and unused-code analysis

**Files:**
- Create: `lefthook.yml`
- Create: `commitlint.config.js`
- Create: `knip.config.ts`
- Modify: `package.json`

**Interfaces:**
- Lefthook runs Bun-compatible formatting/linting on staged files and Commitlint validates conventional single-line commit headers.

- [ ] Add root dev dependencies for `lefthook`, `@commitlint/cli`, `@commitlint/config-conventional`, and `knip`.
- [ ] Configure pre-commit Biome/Ultracite checks over staged TypeScript/JSON/JSONC files without invoking pnpm.
- [ ] Configure commit-msg validation with conventional commits, empty body/footer, and 100-character header limit.
- [ ] Configure Knip project/entry paths for apps and packages, ignoring intentionally shared tooling dependencies.
- [ ] Add a `prepare` script that safely initializes Lefthook in a Git checkout without breaking dependency installation in archives.

### Task 5: Verification and cleanup

**Files:**
- Modify: `package.json` or configs only for verified failures
- Modify: `.gitignore` if coverage/tool outputs are missing

- [ ] Run `bun install` and verify the lockfile.
- [ ] Run `bun run lint`, `bun run test:vitest`, `bun run typecheck`, `bun run build`, `bun run test`, and `bun run smoke:local`.
- [ ] Run `bun run gate` after individual checks pass.
- [ ] Run `bun apps/cli/src/index.ts --help`.
- [ ] Resolve only tooling regressions introduced by this retrofit; record pre-existing or non-actionable Knip findings rather than weakening checks.
- [ ] Commit as `chore: retrofit rack-mount-ts tooling while keeping Bun`.

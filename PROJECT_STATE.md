# OOMPF Project State

## Goal

OOMPF is the public, metadata-only index for sharing OMP profiles. Done means a stranger can publish, discover, inspect, install, and trust a profile through `oompf.run` without the index storing artifact content or silently overstating verification.

## Constraints & preferences

- Runtime: Bun 1.3+, Turbo, Astro server on Cloudflare Workers, Neon/Postgres.
- Tests: `bun:test` only. Full gate: `bun run gate`.
- Commits: one-line signed Conventional Commit; Linear key scope when applicable.
- Never print or persist secrets. Never fabricate provider/model links or upgrade successors.
- Preserve metadata-only storage. Do not add accounts/auth/repository publishing without an explicit scope decision.
- Prefer the smallest existing pattern. No dynamic model catalog service, KV/R2 layer, React Query, live upgrade lookups, or inference at the current zero-user stage.
- Upgrade invariant: fetch the owned Gist current head, never patch the indexed pinned bytes; patch the same Gist and re-register the same source URL so `/p/<id>` stays stable.

## Where we are

### Shipped and live

- GPS-94 + GPS-160: honest recent listing and keyset pagination.
- GPS-152: install CTA duplication fixed.
- GPS-153: OMP/ Pi runtime selection with hermetic tests.
- GPS-159: production rate limiter verified and config drift guarded.
- GPS-161: removed the invalid post-install CTA.
- GPS-134: six-hour source freshness sweep, freshness badges, changed/unreachable signals, rate-limit-safe classification.
- GPS-149: 28-consecutive-404 withdrawal grace window using shared soft delete; reversible by re-registration.
- GPS-76: verified provider/model documentation links and tagged-model resolution.
- GPS-151: deterministic model-source design/spec recorded; dynamic observation service deferred.
- GPS-150: deterministic model catalog, pure planner, current-head Gist patching, `oompf upgrade <OOMPF ref>`, stable identity re-registration.
- CLI reference now documents `upgrade` and its API/GitHub flow.
- GPS-137: bare-Gist installs refused; `oompf add` requires an OOMPF reference, so every install path is pinned and fingerprint-checked. SECURITY.md and the install docs now match the only path that exists.

### Current production facts

- Latest `main`: `f18f57a` (PR #17, GPS-137).
- Latest deploy: run `32848995114` succeeded for that revision.
- Nine indexed profiles were last observed with `checkFailures: 0`, `lastCheckError: null`, and no withdrawals.
- No open pull requests.
- Committed locally but not on `main`: GPS-142 observability (`4e1beb1`). Unpushed, undeployed, so Workers Logs is still off in production.
- Uncommitted in the worktree: GPS-86 guidance alignment (gate-green).
- Published CLI is `0.2.1`, cut before GPS-150 and GPS-137. `bunx @grosspoetrysystems/oompf@0.2.1 --help` lists only add/inspect/publish/search: no `upgrade`, and its `add` still installs bare Gists. Every surface that documents `upgrade` or the bare-Gist refusal is ahead of the release.

## Key decisions

- Model upgrade uses `oompf upgrade <OOMPF ref>`, not `publish --upgrade`: new Gists would change identity.
- The catalog is code-reviewed and versioned. Provider lookup may be a future maintainer refresh input, but it cannot select successors at runtime.
- Current catalog only contains verified successor IDs. Real live profiles with unclassified providers/models remain unchanged.
- GPS-151 already captures the deferred dynamic catalog/index pattern; do not file a duplicate ticket.
- Gist patching has an unavoidable final race after the second head check because GitHub Gist PATCH lacks a reliable If-Match precondition; this is documented in code.
- GPS-142 observability is platform-native: Workers Logs plus one shared logger. No analytics vendor, no log pipeline, no publish counter — invocation logs count traffic and registrations, and the index itself is the permanent record of who published. 4xx `IndexError`s stay out of the log; they are the API working as documented. Logged detail is scrubbed of URL credentials because the Neon driver quotes the connection string in its own errors.
- GPS-82 ("preserve publication identity on repeat publish") is Done in Linear but absent from the code: `apps/cli/src/commands/publish.ts:173` always calls `createPublicProfileGist`, so a repeat publish creates a new Gist and a new `/p/<id>`. No surface claims otherwise, and `oompf upgrade` is the documented way to change a published profile in place. Reconcile the ticket rather than the docs.

## Next action

1. **Push and deploy GPS-142.** Committed on `oompf-latest`, gate-green, not deployed: `observability.logs` (unsampled, invocation logs on) in `apps/web/wrangler.jsonc`, and `logUnexpectedError` in `apps/web/src/lib/services/index-profile.ts` called from `toErrorEnvelope`, `index.astro` and `p/[id].astro` — the three places that replaced a failure with a generic envelope or a reassuring page. Verified locally: an unconfigured database leaves `unexpected error: IndexError: ...` in the server log for all three surfaces, and `wrangler deploy --dry-run` accepts the config. After deploy, confirm the Workers Logs stream shows invocation logs, then count publishes there or from the index itself.
2. **Cut `cli-v0.3.0` from `main`.** This is GPS-86's last acceptance criterion — "every displayed `oompf` command works with the latest published npm release" — and it cannot be met by editing text: `upgrade` and the bare-Gist refusal exist only in `main`. `bun run release` refuses to run off `main`, by design.
3. **GPS-86 guidance alignment, done except that release.** Changed: `index.astro` renders the real canonical install command per row (was `oompf add oompf.run/p/prof_1b7c9e…`, unusable), shared through a new `canonicalProfileUrl` in `apps/web/src/lib/profile-view.ts` so the listing and the profile page cannot drift; the empty state and the `/register` page name the Gist route as the lower-level path into the index and point at `oompf publish <profile-name>`; the nav CTA now says "Register a Gist" rather than "Publish"; both READMEs document `upgrade`; the root README splits global from `bunx`/`npx`. The eleven docs pages needed no changes — they were already native-name-first with the canonical OOMPF URL as the only install reference. GPS-130 (lead the entry surfaces with publishing) remains open and untouched.
4. GPS-133 is outreach, not code: a docs paragraph offered upstream to OMP. GPS-131 needs a genuinely cold machine and cannot be done from this worktree.
5. Keep GPS-150/151 dynamic catalog observations deferred until real usage or model churn justifies the service.

## Map

- GPS-137: https://linear.app/grosspoetrysystems/issue/GPS-137/bare-gist-installs-write-unverified-bytes
- GPS-142: https://linear.app/grosspoetrysystems/issue/GPS-142/no-way-to-tell-nobody-came-from-it-is-throwing
- GPS-133: https://linear.app/grosspoetrysystems/issue/GPS-133/offer-oompf-as-a-reference-to-upstream-omp
- GPS-86: https://linear.app/grosspoetrysystems/issue/GPS-86/align-public-guidance-with-the-profile-first-publish-and-install-flow
- GPS-151 design: `docs/superpowers/specs/2026-08-24-model-upgrade-design.md`
- GPS-150 plan: `docs/superpowers/plans/2026-08-24-model-upgrade.md`
- Live facts: `bun run smoke:deployed` against `https://oompf.run` and `gh run list --workflow=Deploy`.

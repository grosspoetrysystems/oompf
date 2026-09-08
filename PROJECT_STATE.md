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
- Committed locally but not on `main`: GPS-142 observability. Unpushed, undeployed, so Workers Logs is still off in production.

## Key decisions

- Model upgrade uses `oompf upgrade <OOMPF ref>`, not `publish --upgrade`: new Gists would change identity.
- The catalog is code-reviewed and versioned. Provider lookup may be a future maintainer refresh input, but it cannot select successors at runtime.
- Current catalog only contains verified successor IDs. Real live profiles with unclassified providers/models remain unchanged.
- GPS-151 already captures the deferred dynamic catalog/index pattern; do not file a duplicate ticket.
- Gist patching has an unavoidable final race after the second head check because GitHub Gist PATCH lacks a reliable If-Match precondition; this is documented in code.
- GPS-142 observability is platform-native: Workers Logs plus one shared logger. No analytics vendor, no log pipeline, no publish counter — invocation logs count traffic and registrations, and the index itself is the permanent record of who published. 4xx `IndexError`s stay out of the log; they are the API working as documented. Logged detail is scrubbed of URL credentials because the Neon driver quotes the connection string in its own errors.

## Next action

1. **Push and deploy GPS-142.** Committed on `oompf-latest`, gate-green, not deployed: `observability.logs` (unsampled, invocation logs on) in `apps/web/wrangler.jsonc`, and `logUnexpectedError` in `apps/web/src/lib/services/index-profile.ts` called from `toErrorEnvelope`, `index.astro` and `p/[id].astro` — the three places that replaced a failure with a generic envelope or a reassuring page. Verified locally: an unconfigured database leaves `unexpected error: IndexError: ...` in the server log for all three surfaces, and `wrangler deploy --dry-run` accepts the config. After deploy, confirm the Workers Logs stream shows invocation logs, then count publishes there or from the index itself.
2. **In progress: GPS-86, align public guidance with the profile-first flow.** Unblocked — GPS-80, GPS-81 and GPS-82 are all Done, so profile-name-first publish, repeat-publish identity and pinned installs are settled behavior. GPS-130 (lead the entry surfaces with publishing) touches the same copy; treat them as one pass if it stays coherent. Out of scope per the ticket: new CLI behavior, docs information-architecture changes, removing supported alternative references.
3. GPS-133 is outreach, not code: a docs paragraph offered upstream to OMP. GPS-131 needs a genuinely cold machine and cannot be done from this worktree.
4. Keep GPS-150/151 dynamic catalog observations deferred until real usage or model churn justifies the service.

## Map

- GPS-137: https://linear.app/grosspoetrysystems/issue/GPS-137/bare-gist-installs-write-unverified-bytes
- GPS-142: https://linear.app/grosspoetrysystems/issue/GPS-142/no-way-to-tell-nobody-came-from-it-is-throwing
- GPS-133: https://linear.app/grosspoetrysystems/issue/GPS-133/offer-oompf-as-a-reference-to-upstream-omp
- GPS-86: https://linear.app/grosspoetrysystems/issue/GPS-86/align-public-guidance-with-the-profile-first-publish-and-install-flow
- GPS-151 design: `docs/superpowers/specs/2026-08-24-model-upgrade-design.md`
- GPS-150 plan: `docs/superpowers/plans/2026-08-24-model-upgrade.md`
- Live facts: `bun run smoke:deployed` against `https://oompf.run` and `gh run list --workflow=Deploy`.

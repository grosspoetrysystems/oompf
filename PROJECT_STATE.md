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

### Current production facts

- Latest `main`: `ad58c0f docs(GPS-150): document the upgrade command`.
- Latest deploy: successful; Worker version `5ce217ec-9d4e-4e25-a8b8-7e725aab6b4a`.
- Deploy smoke: 13/13 passed.
- Nine indexed profiles were last observed with `checkFailures: 0`, `lastCheckError: null`, and no withdrawals.
- No open pull requests. Worktree clean.

## Key decisions

- Model upgrade uses `oompf upgrade <OOMPF ref>`, not `publish --upgrade`: new Gists would change identity.
- The catalog is code-reviewed and versioned. Provider lookup may be a future maintainer refresh input, but it cannot select successors at runtime.
- Current catalog only contains verified successor IDs. Real live profiles with unclassified providers/models remain unchanged.
- GPS-151 already captures the deferred dynamic catalog/index pattern; do not file a duplicate ticket.
- Gist patching has an unavoidable final race after the second head check because GitHub Gist PATCH lacks a reliable If-Match precondition; this is documented in code.

## Next action

1. **Choose GPS-137's trust policy before coding.** Recommended: refuse bare-Gist installs and require an OOMPF reference, because only OOMPF references have a pinned revision and fingerprint. The alternative is an explicit warning path, but it weakens the trust claim and must be documented on every install surface.
2. Implement GPS-137 with the chosen policy, covering CLI output, direct-Gist behavior, docs, and security tests.
3. Take GPS-142 observability next: value-free production error visibility plus first-party publish/read counts, using existing Cloudflare/Worker logging before adding a paid analytics dependency.
4. Revisit GPS-133 + GPS-86 as a distribution/docs cluster: upstream OMP reference and consistent external guidance.
5. Keep GPS-150/151 dynamic catalog observations deferred until real usage or model churn justifies the service.

## Map

- GPS-137: https://linear.app/grosspoetrysystems/issue/GPS-137/bare-gist-installs-write-unverified-bytes
- GPS-142: https://linear.app/grosspoetrysystems/issue/GPS-142/no-way-to-tell-nobody-came-from-it-is-throwing
- GPS-133: https://linear.app/grosspoetrysystems/issue/GPS-133/offer-oompf-as-a-reference-to-upstream-omp
- GPS-86: https://linear.app/grosspoetrysystems/issue/GPS-86/align-public-guidance-with-the-profile-first-publish-and-install-flow
- GPS-151 design: `docs/superpowers/specs/2026-08-24-model-upgrade-design.md`
- GPS-150 plan: `docs/superpowers/plans/2026-08-24-model-upgrade.md`
- Live facts: `bun run smoke:deployed` against `https://oompf.run` and `gh run list --workflow=Deploy`.

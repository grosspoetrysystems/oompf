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
- GPS-142: Workers Logs enabled (unsampled, invocation logs on) and `logUnexpectedError` behind `toErrorEnvelope`, `index.astro` and `p/[id].astro`, so a 5xx leaves a credential-scrubbed record instead of only a request count.
- GPS-86: every public surface describes the released flow. The index ledger renders the canonical `oompf add https://oompf.run/p/<id>` through the shared `canonicalProfileUrl`; the nav CTA reads "Register a Gist"; both READMEs document `upgrade`; the root README separates global from `bunx`/`npx`.
- `cli-v0.3.0`: `@grosspoetrysystems/oompf@0.3.0` published, the first release carrying `upgrade` and the bare-Gist install refusal.

### Current production facts

- Latest `main`: `5a8f7bc` (`chore: release 0.3.0`), which merged PR #19 (GPS-142 + GPS-86).
- Latest deploy: run `34283625836` succeeded; Worker version `7d050ac2-829c-48ed-a5d6-5059160067f0`. Deploy smoke 13/13 against `https://oompf.run`.
- Published CLI: `0.3.0`, via tag `cli-v0.3.0` and the trusted-publishing workflow (run `34283471584`). Verified against `@latest`: `--help` lists `upgrade`, and `add https://gist.github.com/...` refuses with `unverifiable_artifact`.
- Nine indexed profiles were last observed with `checkFailures: 0`, `lastCheckError: null`, and no withdrawals.
- No open pull requests. Worktree clean apart from this file.
- Workers Logs verified live, not just deployed: `GET /accounts/<id>/workers/scripts/oompf-web/settings` returns `observability.logs = { enabled: true, persist: true, invocation_logs: true, head_sampling_rate: 1 }`, and `wrangler tail oompf-web` showed one record per request carrying `url`, `status` and `outcome`. A 404 produced no `unexpected error:` line, which is the intended 4xx behavior.

## Key decisions

- Model upgrade uses `oompf upgrade <OOMPF ref>`, not `publish --upgrade`: new Gists would change identity.
- The catalog is code-reviewed and versioned. Provider lookup may be a future maintainer refresh input, but it cannot select successors at runtime.
- Current catalog only contains verified successor IDs. Real live profiles with unclassified providers/models remain unchanged.
- GPS-151 already captures the deferred dynamic catalog/index pattern; do not file a duplicate ticket.
- Gist patching has an unavoidable final race after the second head check because GitHub Gist PATCH lacks a reliable If-Match precondition; this is documented in code.
- GPS-142 observability is platform-native: Workers Logs plus one shared logger. No analytics vendor, no log pipeline, no publish counter — invocation logs count traffic and registrations, and the index itself is the permanent record of who published. 4xx `IndexError`s stay out of the log; they are the API working as documented. Logged detail is scrubbed of URL credentials because the Neon driver quotes the connection string in its own errors.
- GPS-82 was marked Done in Linear with no implementing code: `apps/cli/src/commands/publish.ts:173` always calls `createPublicProfileGist`, so a repeat publish creates a new Gist and a new `/p/<id>`. Reopened to Backlog at High on 2026-09-08 with the real scope; the docs were never wrong, only the ticket. GPS-150's `updatePublicProfileGist` is the mechanism it should reuse.
- `scripts/release.ts` committed `chore(cli): release <v>`, which commitlint's `scope-linear-key` rule now rejects — the release would have died after bumping the manifest. It commits scopeless as of `69020a0`.
- Releases are cut from `main`, and `main` is checked out in the sibling worktree at `~/Local/gps/oompf`, which currently holds unrelated uncommitted work. `cli-v0.3.0` was therefore cut by running the script's own sequence by hand from a clean worktree at the same commit. Prefer clearing that worktree over repeating the manual path.
- Local Cloudflare tooling needs two ambient variables unset. `CF_API_TOKEN` in this shell is not a Workers token (it 401s on script settings, tail creation, and observability alike), and `CF_ACCOUNT_ID` points at `4e5f4537...`, a different account from the one holding `oompf-web` (`c6acc25d...`). Every "authentication error" from wrangler traced to that account mismatch, not to a missing credential. Use `env -u CF_API_TOKEN -u CLOUDFLARE_API_TOKEN -u CF_ACCOUNT_ID` with `CLOUDFLARE_ACCOUNT_ID` set, on top of an OAuth login (`wrangler login`, credentials in `~/Library/Preferences/.wrangler/config/default.toml`).
- The OAuth scope set covers `workers_tail:read` but not Workers Observability, so the retained-log query API stays 401 while script settings and live tail work. Read `observability` off the script settings endpoint instead of reaching for the telemetry API.

## Next action

1. **GPS-130: lead the entry surfaces with publishing.** Untouched. GPS-86 only made the labels honest — the homepage still leads with a listing, and the ticket argues browse value is near zero at this supply.
2. **GPS-131: verify `oompf publish` from a cold machine.** Needs a fresh `gh auth`, no prior publication, Node rather than Bun. Not doable from this worktree, and now more worthwhile because `0.3.0` is what a stranger installs.
3. GPS-133 is outreach, not code: a docs paragraph offered upstream to OMP.
4. GPS-82 is reopened and ready to pick up: local profile-to-Gist mapping, then route repeat publish through GPS-150's patch path.
5. Keep GPS-150/151 dynamic catalog observations deferred until real usage or model churn justifies the service.

## Map

- GPS-137: https://linear.app/grosspoetrysystems/issue/GPS-137/bare-gist-installs-write-unverified-bytes
- GPS-82 (reopened): https://linear.app/grosspoetrysystems/issue/GPS-82/preserve-publication-identity-on-repeat-publish-of-the-same-native
- GPS-130: https://linear.app/grosspoetrysystems/issue/GPS-130/lead-the-entry-surfaces-with-publishing-not-browsing
- GPS-131: https://linear.app/grosspoetrysystems/issue/GPS-131/verify-oompf-publish-is-one-command-from-a-cold-machine
- GPS-142: https://linear.app/grosspoetrysystems/issue/GPS-142/no-way-to-tell-nobody-came-from-it-is-throwing
- GPS-133: https://linear.app/grosspoetrysystems/issue/GPS-133/offer-oompf-as-a-reference-to-upstream-omp
- GPS-86: https://linear.app/grosspoetrysystems/issue/GPS-86/align-public-guidance-with-the-profile-first-publish-and-install-flow
- GPS-151 design: `docs/superpowers/specs/2026-08-24-model-upgrade-design.md`
- GPS-150 plan: `docs/superpowers/plans/2026-08-24-model-upgrade.md`
- Live facts: `bun run smoke:deployed` against `https://oompf.run` and `gh run list --workflow=Deploy`.

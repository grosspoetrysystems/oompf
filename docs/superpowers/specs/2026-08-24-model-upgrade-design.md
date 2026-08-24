# Deterministic Model Upgrade Design

## Goal

Let `oompf upgrade <OOMPF ref>` propose and confirm model-only replacements while preserving the profile's strategy and stable `/p/<id>` identity.

## Current boundary

OOMPF already has:

- a Postgres profile index with stable identity derived from source URL;
- pinned revisions and content hashes for reproducible installs;
- YAML parsing, structural validation, and secret scanning;
- CLI profile discovery and GitHub Gist publishing through injectable seams;
- curated provider/model display links in `packages/core/src/provider-links.ts`;
- Astro server rendering and Cloudflare Cron infrastructure.

OOMPF does not have an upgrade command, a model equivalence catalog, a YAML model transformer, or an in-place Gist update helper.

## Decisions

### Upgrade surface

The command is `oompf upgrade <OOMPF ref>`. The ref is an OOMPF profile URL or stable profile id. The command operates on the indexed source rather than guessing which local profile corresponds to a remote record.

The command patches the existing owned Gist in place. Creating a new Gist would change the canonical source URL and therefore derive a new profile identity, violating GPS-150's stable-identity requirement.

### Source of truth

The upgrade planner consumes a versioned, code-reviewed catalog in `packages/core`. The catalog is the authority for slot equivalence and successor mappings. External model lists do not select replacements and no inference call is made.

Each catalog model entry carries:

- full provider/model id;
- provider id;
- tier: `frontier`, `balanced`, or `economy`;
- role fit: `planning`, `coding`, `review`, or `chat`;
- reasoning class: `none`, `standard`, or `reasoning`;
- deployment class: `hosted` or `open-weight`;
- explicit successor id or `null`;
- verified docs URL or `null`.

A maintainer-only refresh/check script MAY query free public model lists and optionally use provider development keys. It produces a reviewable catalog diff. It is not part of the user command or Worker runtime.

The larger dynamic observation service, including Postgres catalog tables, KV/R2 snapshots, live refresh APIs, and inference-based ranking, is deferred to GPS-151's future scope. It is deliberately not required for GPS-150 at the current zero-user stage.

### Current-head safety

The command must fetch the owned Gist's current head before planning or patching. It must never use the indexed pinned revision as patch input: the author may have edited the Gist since OOMPF indexed it, and patching the old revision would overwrite those edits.

The indexed revision remains useful as provenance and as the baseline shown in output. The current head is the source of truth for the patch.

### Transformation scope

Only recognized model-selector locations are transformed:

- `modelRoles.<role>` string values;
- `modelRoles.<role>` fallback arrays;
- `enabledModels` string arrays;
- `retry.fallbackChains` map/list forms.

Selectors beginning with `@` are aliases and never change. Thinking suffixes (`:high`, `:max`, etc.) remain attached to the replacement's selector. All other keys, values, comments where supported by the YAML document model, advisor configuration, tier-like fields, and unknown keys remain unchanged.

### Preview and confirmation

Preview is the default and performs no writes. It reports:

- current source and profile id;
- catalog revision;
- each changed selector and its explicit successor;
- unchanged selectors with reasons (`no_successor`, `unavailable`, `slot_mismatch`, or `already_current`);
- whether the current Gist head differs from the indexed revision.

Confirmation is required before the Gist patch. `--json` emits the same plan and result as machine-readable output. A no-op exits successfully without changing the Gist.

### Cross-system write order

There is no transaction spanning GitHub and Postgres. The confirmed flow is:

1. fetch current Gist head;
2. transform and validate the candidate YAML;
3. patch the existing Gist;
4. re-register the unchanged source URL so OOMPF records the new revision/hash;
5. report the stable OOMPF URL and new revision.

If registration fails after the patch, the command returns a failure that explicitly says the Gist changed but the index did not. It never reports success. A retry re-registers the current source without applying the model transform twice.

## Failure behavior

- Indexed profile has no revision or Gist id: refuse as unverifiable.
- Current Gist cannot be fetched: refuse before any write.
- Current Gist owner is not the authenticated user: refuse before any write.
- Catalog revision is missing or malformed: refuse before any write.
- Candidate successor is unavailable or ambiguous: leave that selector unchanged and explain why.
- Structural validation or secret scan fails: refuse before any write.
- GitHub patch succeeds but registration fails: non-zero result with repairable state; no false success.

## Verification

The implementation must prove:

- planner replacement is deterministic;
- roles, fallback order, thinking suffixes, aliases, advisor fields, and unknown keys are preserved;
- preview makes no GitHub or index write;
- current-head edits survive the upgrade;
- only the owned Gist can be patched;
- the same source URL produces the same profile id after re-registration;
- a successful upgrade records a new revision and content hash;
- no-op and rejected plans produce no writes.

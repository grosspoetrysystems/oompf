---
title: Provenance and revisions
summary: How OOMPF records source URL, revision, and the SHA-256 fingerprint.
section: Workflow
order: 3
---

# Provenance and revisions

Provenance is what lets you trust and reproduce a shared profile. OOMPF keeps just
enough to re-fetch and re-verify the source — and nothing that would leak its
contents.

## What OOMPF records

- **Canonical source URL** — the normalized public Gist URL, unique across the
  index. It is the source of truth; OOMPF stores no YAML bytes.
- **Source revision** — the GitHub revision (git SHA) of the exact snapshot OOMPF
  indexed. On the profile page it links to the corresponding Gist revision when
  available.
- **Content fingerprint** — the SHA-256 of the exact YAML bytes OOMPF indexed. It
  is copyable and explained as a verification value, and it is re-checked at
  install time.
- **Profile id** — a stable opaque id derived from the canonical source URL. It is
  represented by the page URL, `https://oompf.run/p/<id>`, and is not printed as a
  second redundant identifier.

## Freshness

A pinned revision is reproducible but says nothing about whether the source moved
on. Every six hours OOMPF re-fetches each indexed source's current head and
records four facts, all visible on the profile page and in the profile metadata
API:

- **Last checked** — when the source was last re-fetched. Absent until the first
  sweep reaches that profile.
- **Changed since indexed** — when the source was *first* observed to differ from
  the indexed fingerprint. While this is set, the page's facts describe the
  earlier revision, and re-registering the source brings the record up to date.
- **Consecutive check failures** — a single failure is reported as a failed check
  and retried; repeated failures flag the source as unreachable, which is what a
  deleted or newly private Gist looks like. GitHub answers 404 for both, so the
  flag stays reversible rather than deleting anything.
- **Last check outcome** — `not_found` or `unreachable`. Only the code is stored,
  never a raw error message.

The sweep records signals only. It never rewrites indexed facts, so a source
changing under you can never silently change what the index says it contained.

## Why it matters

- **Reproducibility.** For an OOMPF URL or id, `oompf add` fetches the exact
  indexed Gist revision rather than the Gist's latest state.
- **Verification.** Before writing locally, `oompf add` re-validates that pinned
  snapshot and rejects it unless its SHA-256 matches the indexed fingerprint.
- **Idempotence.** Re-registering an unchanged source resolves to the same id and
  leaves the record untouched.

Direct Gist URLs and ids remain supported, but they have no OOMPF index record to
verify against. They are fetched and structurally validated without claiming
indexed provenance.

The full values are available in the expanded provenance section of each profile
page and in the [profile metadata API](/docs/cli-reference).

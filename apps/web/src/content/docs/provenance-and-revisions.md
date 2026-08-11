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

## Why it matters

- **Reproducibility.** The revision plus fingerprint pin exactly what was indexed.
- **Verification.** `oompf add` re-fetches, re-validates, and checks the
  fingerprint before installing.
- **Idempotence.** Re-registering an unchanged source resolves to the same id and
  leaves the record untouched.

The full values are available in the expanded provenance section of each profile
page and in the [profile metadata API](/docs/cli-reference).

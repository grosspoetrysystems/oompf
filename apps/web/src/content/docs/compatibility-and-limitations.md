---
title: Compatibility and limitations
summary: What OOMPF guarantees, the API versioning policy, and explicit non-goals.
section: Reference
order: 2
---

# Compatibility and limitations

## Runtime authority

OOMPF is the authority for sharing and understanding profiles. **OMP remains the
runtime authority.** OOMPF does not control, override, or re-implement OMP
execution behavior, and it documents only the profile concepts needed to share
and use a configuration. For the complete `omp` command surface and runtime
semantics, follow the upstream OMP documentation.

## API versioning

- Canonical agent routes are under `/api/v1`.
- The unversioned `/api/...` routes remain **compatibility aliases** during the v0
  transition. They share the same handlers and the same response contracts.
- Response envelopes and error codes are stable. The reference contract is
  [`/openapi.json`](/openapi.json), with response shapes at
  [`/schemas/profile-metadata.json`](/schemas/profile-metadata.json),
  [`/schemas/profile-mappings.json`](/schemas/profile-mappings.json), and
  [`/schemas/error.json`](/schemas/error.json).

## The profile reference

The profile reference documented here is versioned against the OMP behavior
observed during documentation generation. Examples use native OMP YAML; upstream
OMP is authoritative for field semantics.

## Guarantees

- OOMPF stores **metadata only** — never canonical YAML, never secrets.
- Curated provider/model links are verified; unknown identifiers are **never**
  assigned a guessed URL.
- The canonical install reference is always the OOMPF URL,
  `oompf add https://oompf.run/p/<id>`.

## Non-goals

- Re-documenting the entire OMP runtime or every `omp` command.
- Treating provider API/base URLs as public documentation links.
- Resolving arbitrary model identifiers to guessed URLs.
- Storing canonical YAML in OOMPF's database.
- Authentication, accounts, repository publishing, or a generalized
  agent-profile platform.

## Machine-readable indexes

Agents should follow the curated indexes rather than scraping HTML:
[`/llms.txt`](/llms.txt) (site-wide) and [`/docs/llms.txt`](/docs/llms.txt)
(documentation). A `/llms-full.txt` export, if present, is a non-normative
convenience only.

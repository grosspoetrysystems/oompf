---
title: Installing a profile
summary: Install a shared profile safely by its canonical OOMPF URL.
section: Workflow
order: 2
---

# Installing a profile

Install a shared profile with its canonical OOMPF URL:

```bash
oompf add https://oompf.run/p/<id>
```

The install reference is **always** the canonical OOMPF URL. OOMPF resolves the
profile, fetches its canonical Gist, and installs it as a native OMP profile. The
raw Gist URL is never used as the install reference.

## Safe-install behavior

1. **Resolve.** The OOMPF URL (or a bare `prof_…` id) resolves to the canonical
   source coordinates.
2. **Fetch and re-validate.** The canonical YAML is fetched and validated
   structurally and for secrets at install time — not trusted from the index.
3. **Verify.** The fetched bytes are checked against the recorded SHA-256
   fingerprint so you install exactly what was indexed.
4. **Install.** The validated artifact is written as a native OMP profile.

If validation fails or the source is unreachable, `add` stops with a stable error
and installs nothing.

## Requirements the profile cannot satisfy

A profile may **evidence** requirements it cannot itself provide — environment
variables, extensions, or project overlays. OOMPF lists these as actionable
requirements. Providers already represented by a model selector are **not**
repeated as requirements. Configure any listed requirements in your local OMP
environment before use.

See [Getting started](/docs/getting-started) for the end-to-end flow.

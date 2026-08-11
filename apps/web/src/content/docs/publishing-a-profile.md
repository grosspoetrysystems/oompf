---
title: Publishing a profile
summary: Turn a local profile into a public Gist and register its metadata.
section: Workflow
order: 1
---

# Publishing a profile

Publishing makes a local profile discoverable through OOMPF while keeping the
canonical YAML on GitHub.

```bash
oompf publish ./my-profile.yaml
```

## What happens

1. **Local validation.** The artifact is validated structurally and scanned for
   secrets before anything leaves your machine. A blocking secret finding stops
   the publish.
2. **Gist creation.** The validated YAML is uploaded as a **public** GitHub Gist.
   GitHub assigns it an owner, an id, and a revision (git SHA).
3. **Registration.** OOMPF fetches the canonical Gist, re-validates it, extracts
   facts and any `oompf` metadata, and indexes the **metadata only**. It records
   the canonical source URL, the pinned revision, and a SHA-256 fingerprint.

The command prints the canonical profile URL, `https://oompf.run/p/<id>`.

## Notes

- OOMPF does not invent an OMP runtime version. If your profile carries a config
  marker such as `setupVersion`, it stays a config marker and is not reported as
  the OMP version.
- Re-publishing an unchanged source is idempotent: the same canonical URL always
  resolves to the same profile id.
- The canonical artifact always lives at its Gist. OOMPF stores no YAML bytes.

See [Installing a profile](/docs/installing-a-profile) and
[Provenance and revisions](/docs/provenance-and-revisions).

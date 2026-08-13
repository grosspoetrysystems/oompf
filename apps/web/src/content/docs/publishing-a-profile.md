---
title: Publishing a profile
summary: Turn a local profile into a public Gist and register its metadata.
section: Workflow
order: 1
---

# Publishing a profile

Publishing makes a native OMP profile discoverable through OOMPF while keeping
the canonical YAML on GitHub.

```bash
oompf publish work
```

`work` is the profile's native name, the same name you use with
`omp --profile work`. OOMPF asks OMP where the profile lives rather than taking
a file path.

## Omitted input

If you run `oompf publish` without a name, OOMPF automatically uses the sole
publishable profile. With multiple profiles it opens a selector only in an
interactive terminal; `--json`, CI, and piped execution return
`ambiguous_profile` instead of prompting.

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
- Each successful invocation creates a new public Gist. OOMPF does not remember
  a previous publication for the local profile.
- The canonical artifact always lives at its Gist. OOMPF stores no YAML bytes.

See [Installing a profile](/docs/installing-a-profile) and
[Provenance and revisions](/docs/provenance-and-revisions).

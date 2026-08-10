# OOMPF Authority Layer and Profile Presentation

## Status

Approved design. OOMPF becomes the user-facing authority for sharing, inspecting, installing, and understanding portable OMP profiles. OMP remains the runtime authority for the complete `omp` command surface and execution behavior.

## Goals

- Make an OOMPF profile page understandable without decoding internal identifiers.
- Preserve useful provenance while explaining every identifier and giving it an action.
- Add optional author-provided profile context without compromising native OMP compatibility.
- Establish an integrated `/docs` authority for OOMPF and the OMP profile concepts required by the workflow.
- Use OMP's installed catalog for model/provider facts while maintaining a small verified OOMPF link registry.

## Non-goals

- Re-document the entire OMP runtime or every `omp` command.
- Treat provider API endpoints as public documentation URLs.
- Resolve arbitrary model identifiers to guessed or search-engine URLs.
- Store canonical YAML in OOMPF's database.
- Turn OOMPF into a generalized agent-profile platform.

## Portable metadata contract

An optional namespaced block may be included in the canonical YAML:

```yaml
oompf:
  summary: "A low-cost coding profile for Kimi and GLM."
  kind: coding
  tags:
    - kimi
    - low-cost
```

Rules:

- OMP must be able to ignore the block at runtime.
- `summary` is optional, plain text, length-limited, and rendered as author-provided content.
- `kind` uses standard values (`coding`, `research`, `review`, `creative`, `general`) and accepts a short custom fallback.
- `tags` are optional, normalized, length-limited strings.
- OOMPF validates and indexes this block separately from native OMP facts.
- Ordinary YAML comments are not used as metadata because parsers normally discard them.
- Unknown native OMP keys remain preserved and reported for forward compatibility.

## Fact and display model

The index distinguishes three categories:

### Native OMP facts

Models, model roles, providers, advisors, fallbacks, hooks, extensions, inspection settings, and runtime prerequisites.

### OOMPF metadata

Summary, kind, and tags from the `oompf` block.

### Derived display facts

Friendly model names, exact selectors, alias classification, and verified provider/model links.

Provider names are not repeated as prerequisites. Prerequisites contain only actionable non-provider requirements such as environment variables, extensions, and project overlays. Values such as `@tiny` are classified as OMP aliases and are not shown as concrete models.

## Model and provider links

OMP catalog data supplies provider IDs, display labels, bundled model IDs, defaults, capabilities, and API/base URLs. It does not reliably supply canonical public documentation URLs.

OOMPF maintains a small curated registry keyed by provider and optional model pattern. Registry entries contain verified public provider/model destinations. Unknown identifiers remain unlinked. API/base URLs, especially local or private endpoints, are never automatically rendered as public links.

Model presentation uses friendly-first display:

```text
Kimi K2.7 Code
opencode-go/kimi-k2.7-code
Open provider page ↗
```

The exact selector remains visible as secondary copyable/reference text.

## Profile page

The primary header contains:

- profile name;
- optional author summary;
- kind and tags;
- publisher attribution;
- structural validity.

The primary install command is always the canonical OOMPF URL:

```text
oompf add https://oompf.run/p/<id>
```

It must not use the raw Gist URL as the install reference.

Content sections:

1. **Models** — friendly names first, exact selectors second, verified links where available.
2. **Providers** — compact linked tags.
3. **OMP aliases** — shown only when present; aliases are labeled as OMP shortcuts.
4. **Behavior** — advisor, fallback, hook, extension, and relevant OMP settings.
5. **Requirements** — actionable non-provider prerequisites only.
6. **Source and provenance** — canonical Gist link and explained integrity metadata.

### Provenance

Revision and SHA-256 remain available because they support reproducibility, but they are not unexplained header strings.

- **Source revision** is a link to the corresponding GitHub Gist revision when available. Explanation: GitHub's version identifier for the source snapshot OOMPF indexed.
- **Content fingerprint** is the SHA-256 of the exact YAML bytes OOMPF indexed. It is copyable and explained as a verification value.
- Full values are available in the expanded provenance section.
- The OOMPF profile ID is represented by the page URL and is not redundantly printed as another visible identifier.

## Public documentation

Add a first-class `/docs` section and a Docs navigation link:

```text
/docs
  What is OOMPF?
  Getting started
  OMP profiles
  Profile format
  Metadata and summaries
  Models and providers
  CLI reference
    oompf publish
    oompf inspect
    oompf search
    oompf add
  Publishing a profile
  Installing a profile
  Provenance and revisions
  Compatibility and limitations
```

OOMPF owns the documentation for publishing, indexing, inspection, installation, provenance, its CLI, and the portable `oompf` metadata convention. It documents the OMP profile fields required to understand shared configurations. Complete OMP runtime behavior and the full `omp` command surface remain linked to upstream OMP documentation.

The profile reference is versioned against the OMP behavior observed during documentation generation. Examples use native OMP YAML. Each CLI page includes syntax, examples, output, failure modes, and safe-install behavior.

The repository README remains developer/setup documentation. `/docs` is the user-facing authority.

## Agent-facing surfaces

OOMPF is designed to be consumed without HTML scraping.

### Documentation indexes

- `/llms.txt` is the concise site-wide documentation and endpoint map.
- `/docs/llms.txt` is the scoped index for documentation pages.
- Documentation pages expose clean Markdown variants, linked with `rel="alternate" type="text/markdown"`.
- Pages and Markdown variants identify the applicable `llms.txt` with `rel="describedby"`.
- `/llms-full.txt` MAY be generated as a convenience export, but it is non-normative; agents must follow the curated indexes and linked Markdown pages instead.

The indexes follow the llms.txt proposal: an H1, concise summary, short interpretation notes, and H2 sections containing Markdown links with useful descriptions. The root index routes agents to scoped documentation indexes and machine-readable contracts, following the hierarchical pattern used by major developer documentation sites.

### Versioned API

Canonical agent API routes use `/api/v1`:

- `GET /api/v1/profiles/:id` — profile metadata, validation, facts, provenance, and OOMPF metadata.
- `GET /api/v1/search?q=...` — searchable profile summaries.
- `POST /api/v1/profiles` — fetch, validate, normalize, and register a public Gist.
- `GET /api/v1/mappings/providers` — curated provider identities and canonical links.
- `GET /api/v1/mappings/models/:provider` — curated model patterns, display names, and canonical links.

The API is described by an OpenAPI 3.1 document at `/openapi.json`. Shared response shapes are also published as JSON Schema documents:

- `/schemas/profile-metadata.json`
- `/schemas/profile-mappings.json`
- `/schemas/error.json`

Existing `/api/...` routes remain compatibility aliases during the v0 transition. The CLI uses the versioned routes after migration. JSON response envelopes, field meanings, and stable error codes are documented in the API reference.

### Machine-readable mappings

Publish a profile metadata schema and an OMP-to-OOMPF mapping that distinguish:

- canonical YAML fields;
- extracted native OMP facts;
- OOMPF-authored `oompf` metadata;
- derived display facts;
- provenance and integrity fields.

The provider/model mapping is explicit and curated. Unknown identifiers remain valid data with no fabricated public URL.

### Agent workflow

The machine-readable docs include the complete workflow:

```text
publish -> inspect -> search -> add
```

Examples show canonical OOMPF URLs, JSON output, stable errors, source/provenance handling, and safe installation behavior.

## Data flow

```text
canonical YAML
  -> validate native artifact
  -> validate optional oompf metadata
  -> extract OMP facts
  -> classify aliases and model selectors
  -> enrich with catalog names and curated links
  -> persist metadata only
  -> render profile page and docs links
```

## Acceptance criteria

- A profile with `oompf.summary`, `kind`, and `tags` renders those values without affecting native OMP installation.
- A profile without the block behaves exactly as before.
- Provider names do not appear in both Providers and Requirements.
- `@tiny` appears only in OMP aliases, not Models.
- Concrete models display friendly names and exact selectors.
- Known registry entries link to verified destinations; unknown entries have no fabricated links.
- The page's install command uses the OOMPF URL.
- Revision is linked and explained; SHA-256 is explained and copyable.
- `/docs` is discoverable from global navigation and contains the listed authority/reference pages.
- CLI examples and profile-page install commands exercise the same canonical URL flow.
- Existing validation, provenance, indexing, and install safety behavior remains intact.
- `/llms.txt` and `/docs/llms.txt` are reachable, concise, and link to clean Markdown pages; `/llms-full.txt`, if generated, is a non-normative convenience export.
- `/api/v1` routes expose documented JSON shapes and stable error codes.
- Existing `/api/...` routes remain compatibility aliases.
- Provider/model mappings are machine-readable and never fabricate unknown links.

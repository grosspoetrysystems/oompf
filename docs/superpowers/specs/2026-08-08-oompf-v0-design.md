# OOMPF v0 Design

Date: 2026-08-08
Status: Approved for implementation planning

## Product boundary

OOMPF is an ecosystem layer around native OMP profiles.

```text
User     owns configuration
GitHub   owns canonical source, history, and attribution
OOMPF    owns indexing, enrichment, discovery, and ergonomics
OMP      owns execution
```

OOMPF does not execute profiles, replace the OMP schema, store a permanent copy of a profile artifact, or require an OOMPF account.

The first milestone targets highly proficient, agent-oriented developers and is a community-facing show piece. The CLI is terminal-first, concise, scriptable, and transparent about source, revision, validation, and installation details.

## Scope

GitHub Gists are the only publishing source in v0.

The complete workflow is:

```text
local OMP profile
  → public GitHub Gist
  → OOMPF registration/index
  → shareable /p/<id>
  → inspect
  → install as native OMP profile
```

GitHub repositories are out of the v0 publish flow. Repository indexing may be added later without changing the profile-source abstraction.

## Workspace structure

The repository is a Bun workspace:

```text
apps/
  cli/       Bun + TypeScript + Incur
  web/       Astro + Cloudflare Workers

packages/
  core/      OMP discovery, YAML parsing, Zod validation, normalization
  github/    gh CLI publishing and raw Gist fetching
  database/  Drizzle schema and Postgres repository
```

The CLI and web app share domain schemas and normalized metadata through workspace packages.

## Canonical profile artifact

OMP named profiles resolve through OMP's own directory resolver. A typical
installation uses:

```text
~/.omp/profiles/<name>/agent/config.yml
```

but `PI_CONFIG_DIR`, `PI_CODING_AGENT_DIR`, XDG locations, and platform-specific
rules can change the actual path. OOMPF MUST NOT construct this path itself.
The CLI asks the installed OMP for the target directory with:

```bash
omp --profile <name> config path
```

and writes only within the returned directory.

The native profile name is the directory name; it is not a required field in
`config.yml`. To preserve that name across publication, `oompf publish` creates
a one-file Gist whose filename is `<profile-name>.yml`. The YAML bytes remain
the canonical OMP configuration; the Gist filename carries the native name.

A v0 publication contains exactly one supported YAML artifact. Registration
accepts a Gist only when it contains one unambiguous YAML file and derives the
profile name from that filename. A direct Gist with no usable profile filename
is rejected rather than guessed.

The publisher reads the resolved native `config.yml` or `config.yaml` file and
creates a Gist file named `<profile-name>.yml`. The YAML bytes remain the
canonical OMP configuration; the Gist filename carries the native name.

The artifact excludes:

- auth credentials and auth-broker state;
- databases, caches, logs, and sessions;
- machine-local hooks and extensions;
- project-local `.omp/config.yml` overlays;
- `.env` files from home, config root, agent, or project;
- unrelated files in the profile directory.

The native OMP YAML remains the canonical payload. OOMPF validation preserves
unknown keys where possible so newer OMP settings are not silently discarded.
The artifact represents the portable profile layer, not the complete effective
configuration for every project and machine.

The initial maximum profile size is 1 MB. Larger or ambiguous Gists receive an
actionable error and should use a repository in a future version.

### Cross-system installation contract

OMP profile names MUST be validated using OMP-compatible rules: lowercase ASCII
letters/digits plus `.`, `_`, and `-`; start with a letter or digit; maximum 64
characters; no `.`/`..`; no trailing `.`; and no Windows reserved device names.
The default consumer name is `<github-owner>-<profile-name>`. If that derived
name is invalid or exceeds 64 characters, installation fails with an actionable
request to use `--name`. OOMPF never silently truncates or rewrites names.

The CLI uses platform path APIs, creates the target directory atomically where
possible, writes the config with restrictive permissions, and refuses any
existing target directory without an overwrite option.

## CLI surface

```bash
oompf publish [profile]
oompf add <ref> [--name <name>]
oompf inspect <ref>
oompf search [query]
```

Commands provide structured output with `--json` where useful. Human output is concise and includes exact URLs, hashes, revisions, and commands rather than hiding important state behind prose.

### `oompf publish [profile]`

1. Resolve the named OMP profile. With no argument, enumerate profile roots through OMP-compatible path resolution and select profiles containing `config.yml` or `config.yaml`.
2. Read the complete canonical YAML artifact.
3. Validate the YAML and scan for likely secrets and machine-local values.
4. Verify the local `gh` installation and authentication.
5. Detect the GitHub owner through `gh`.
6. Create a public Gist using `gh gist create --public`.
7. Register the canonical Gist URL with OOMPF.
8. Print the GitHub URL, OOMPF URL, source revision/hash, and copyable install command.

The CLI does not authenticate with OOMPF.

### `oompf add <ref>`

`ref` may be an OOMPF profile URL or a public Gist URL.

1. Resolve the OOMPF record or inspect the Gist source directly.
2. Fetch the canonical YAML.
3. Validate it before writing anything.
4. Derive the default local name as `<github-owner>-<profile-name>` and validate it with OMP-compatible profile-name rules.
5. Use `--name <name>` when the installer wants a different native OMP profile name.
6. Ask the installed OMP for the target agent directory with `omp --profile <name> config path`.
7. If the target native profile directory exists, fail without modifying it.
8. Write the native OMP profile configuration atomically into the resolved directory.

There is no `--force` option and no silent overwrite or update behavior. The error must state the conflicting path and show the command using `--name`.

### `oompf inspect <ref>`

Resolve a profile URL or Gist URL, fetch and validate the canonical YAML, and display the source, revision/hash, profile name, owner, OMP facts, models, providers, advisors, hooks, and validation warnings. Inspection does not install or mutate local state.

### `oompf search [query]`

Search indexed metadata by profile name, owner, model, provider, advisor, hook, and free-text fields. Human output is compact; `--json` returns stable machine-readable records.

## Source and indexing API

The initial API accepts public Gists only:

```http
POST /api/profiles
Content-Type: application/json

{"source":"https://gist.github.com/<owner>/<gist-id>"}
```

The endpoint:

1. validates that the URL is a supported public Gist reference;
2. fetches the canonical raw YAML from GitHub;
3. identifies the single supported profile artifact;
4. validates the YAML and size limit;
5. normalizes the configuration without changing the source;
6. extracts reliable source facts;
7. derives searchable metadata;
8. persists the index record;
9. returns the stable OOMPF profile URL.


### Validation and compatibility levels

The local CLI and Cloudflare indexer have different authorities:

- The CLI uses the installed OMP binary for path resolution and may run a
  temporary-profile preflight so the publisher sees errors from the actual OMP
  version in use.
- The Cloudflare indexer performs YAML parsing, mapping-root checks, size limits,
  secret-pattern checks, and metadata extraction. It cannot import the
  publisher's local OMP installation and MUST label this as structural
  validation rather than complete OMP schema validation.

The indexed record stores the publisher-reported OMP version when publishing
through the CLI. Direct Gist registration may omit that fact. The profile page
must show the version fact when available and state that provider credentials,
environment variables, project overlays, and external extensions remain local
runtime prerequisites.
The endpoint must not persist a permanent OOMPF-owned artifact copy. Caching parsed metadata for rendering and search is allowed.

Re-registering the same canonical Gist maps to its existing OOMPF profile record. A changed Gist revision updates indexed metadata and content hash while GitHub remains responsible for revision history.

## Profile identity and database model

The primary public identifier is an opaque database-owned ID exposed as:

```text
/p/<id>
```

The GitHub URL is always prominent on the profile page and remains the canonical source identity.

The minimum persisted model contains:

- stable profile ID;
- canonical Gist URL and Gist ID;
- GitHub owner;
- native OMP profile name;
- source revision;
- canonical content hash;
- normalized metadata and extracted facts;
- first-indexed and last-indexed timestamps;
- current indexing status and validation result.

A separate revision table is optional if implementation needs indexed revision history; GitHub history remains authoritative and v0 must not duplicate it unnecessarily.

## Metadata extraction

Extract only facts that are reliably available from the native OMP YAML:

- profile name;
- GitHub owner and source type;
- publisher OMP version when supplied;
- source revision and hash;
- configured models and model roles;
- providers inferred from model identifiers;
- fallback chains;
- advisor settings;
- configured hooks/extensions when represented in the artifact;
- relevant context, memory, and inspection settings;
- external provider, environment, project-overlay, or extension prerequisites;
- validation level and warnings.

Metadata is enrichment, not a second execution schema. OOMPF must never reinterpret these fields into a generalized agent-role system.

## Web experience

Astro pages and endpoints:

- `/` — explanation, recent/featured profiles, and search;
- `/p/<id>` — profile details and canonical source;
- `/register` — public Gist registration form;
- `POST /api/profiles` — registration endpoint;
- `GET /api/profiles/<id>` — machine-readable profile metadata;
- search endpoint as needed by the page and CLI.

The profile page is a community show piece: readable YAML facts, GitHub attribution, source revision/hash, detected configuration, validation status, and a copyable installation command. The canonical GitHub source is prominent and never hidden behind OOMPF abstractions.

## Deployment and operations

- Astro server output runs on Cloudflare Workers.
- Wrangler builds and deploys the Worker.
- Drizzle uses a Cloudflare-compatible Postgres driver.
- GitHub Actions runs formatting/type checks/tests/build and deploys with Wrangler.
- Runtime database and deployment secrets live in Cloudflare configuration, never in Gists or repository source.
- The CLI's OOMPF endpoint is configurable for local development and production.

## Error handling and safety

Errors are actionable and preserve the expert workflow. They identify the failed prerequisite and the exact next command where possible.

Required failure cases:

- OMP is unavailable;
- selected profile does not exist or lacks `config.yml`/`config.yaml`;
- YAML is invalid or exceeds 1 MB;
- likely secret or machine-local value is detected;
- `gh` is unavailable or unauthenticated;
- Gist creation fails;
- source is private, unsupported, ambiguous, or unreachable;
- registration/indexing fails;
- local installation name already exists.

Secret scanning blocks publication by default for high-confidence findings and reports the file path/key context without printing secret values. Lower-confidence findings are warnings requiring an explicit publish decision in interactive mode and a non-zero failure in non-interactive mode unless a future explicit override is designed.

## Verification targets

The implementation must prove the complete path locally:

1. discover a real local OMP profile;
2. validate and scan its canonical YAML;
3. publish a public test Gist through the authenticated `gh` CLI;
4. register the Gist through the API;
5. render and inspect `/p/<id>`;
6. search for the indexed profile;
7. install it under the derived native name;
8. reject a second install with the same name without modifying local state;
9. install successfully with `--name`.

Tests cover parsing/normalization, source validation, secret detection, stable identity, registration idempotency, install naming, collision refusal, CLI JSON output, and API error responses.

# oompf

`oompf` publishes, inspects, searches, and installs OMP (Oh My Pi) agent
profiles through the OOMPF index at [oompf.run](https://oompf.run).

A local profile becomes a public GitHub Gist, its metadata is registered in the
index, and anyone can reinstall it as a native OMP profile:

```text
oompf publish <profile>   → public Gist → indexed → https://oompf.run/p/<id>
oompf add <url>           → installs a native OMP profile
omp --profile <name>      → run it
```

The canonical profile artifact always stays at its public Gist; OOMPF persists
and serves **metadata only**.

## Requirements

- **Node >= 22 or Bun.** The CLI uses `Promise.withResolvers`, which requires
  Node 22+ (or any Bun release).
- **GitHub CLI (`gh`), authenticated** — required for `publish`, which creates a
  public Gist with your `gh` account. Verify with `gh auth status`; run
  `gh auth login` first if needed.
- **OMP CLI (`omp`) on `PATH`** — required for `publish` (resolves the local
  profile's config path) and `add` (resolves the install directory). OOMPF asks
  OMP where a profile lives rather than hardcoding a home path. `omp` is itself
  a Bun program.

## Install

**Not yet published.** The package is not on npm as of this writing. The intended
post-publish install is:

```bash
bunx @grosspoetrysystems/oompf@latest --help
```

Until then, run it from source in the repository:

```bash
bun apps/cli/src/index.ts --help
```

## Commands

Every command prints human-readable output by default and structured JSON with
`--json`. On failure, every command exits non-zero and prints a stable error
envelope: a machine-readable `code`, a human `message`, and optional
value-free `details`.

All commands target `https://oompf.run` by default. Set `OOMPF_BASE_URL` to point
elsewhere, for example at a local instance:

```bash
OOMPF_BASE_URL=http://localhost:4321 oompf search anthropic
```

### `oompf publish [profile]`

Resolve a local OMP profile (pass the name, or omit it when exactly one profile
is unambiguous), validate and secret-scan its `config.yml`, create a public
one-file Gist, and register its metadata with the index.

```bash
oompf publish work
```

Output: the `githubUrl`, the canonical `oompfUrl` (`https://oompf.run/p/<id>`),
a copyable `addCommand`, the artifact `hash`, the structural verdict, and any
warnings.

Failure modes:

- `no_profile` — no OMP profiles were found; pass an explicit name.
- `ambiguous_profile` — more than one profile exists; pass the one to publish.
- `missing_config` — the profile has no `config.yml` / `config.yaml`.
- `invalid_artifact` — the profile failed structural validation.
- `blocking_secrets` — high-confidence secrets were detected in the config;
  nothing is published. Remove them and retry.
- GitHub authentication or Gist-creation failure (e.g. `gh` not installed or
  not authenticated), or registration failure against the index
  (`network_error`, or the server's own code such as `validation_failed`).

Nothing is registered if local validation fails.

### `oompf add <ref> [--name <name>]`

Install a shared profile as a native OMP profile. The reference may be an OOMPF
URL or id, a public Gist URL, or a bare Gist id.

```bash
oompf add https://oompf.run/p/prof_1b7c9e0a4d2f3a5b6c8d9e0f1a2b3c4d
```

The canonical YAML is fetched and re-validated before anything is written. The
local name defaults to `<owner>-<profile>` and overrides with `--name`. The
install directory is resolved by asking OMP itself. An existing config is
refused outright — there is no overwrite and no `--force`.

Output: the installed `name`, the `path` written, the artifact `hash`, the
`command` to run it, and any warnings.

Failure modes:

- `invalid_artifact` — the fetched artifact failed structural validation.
- `invalid_name` — the derived (or `--name`) profile name violates OMP's naming
  rules; pass an explicit valid `--name`.
- `target_exists` — a profile with that name already has a config; OOMPF refuses
  to overwrite it.
- `network_error` — the index or Gist source could not be reached.
- The Gist is missing or private, or the reference is not a supported Gist/URL.

### `oompf inspect <ref>`

Show a shared profile's metadata without installing it.

```bash
oompf inspect https://oompf.run/p/prof_1b7c9e0a4d2f3a5b6c8d9e0f1a2b3c4d
```

An OOMPF reference is answered from the index; a Gist reference is fetched and
validated live. Output is metadata only — models, providers, aliases, the
structural verdict, provenance, and the install command. The canonical artifact
content is never emitted.

Failure modes: `not_found` for an unknown indexed id; `network_error` when the
index is unreachable; Gist fetch errors when the source is missing, private, or
unsupported.

### `oompf search [query]`

Free-text search over the index. Omitting the query lists all indexed profiles.

```bash
oompf search anthropic
```

Output: the normalized `query`, the result `count`, and one compact metadata-only
record per match (id, name, owner, models, providers, revision, structural
verdict, source, and canonical URL).

Failure mode: `network_error` when the index is unreachable.

## JSON output and errors

- `--json` on any command returns the same data the human output renders,
  machine-readable.
- Failures use a stable envelope with a machine-readable `code` — see the codes
  listed per command above. Network failures map to `network_error`; unexpected
  errors fall back to the generic code `error`. Server errors surface the
  server's own code (for example `not_found`, `validation_failed`,
  `internal_error`).

## Safety

- **Secrets are scanned before publish.** High-confidence findings block the
  publish with `blocking_secrets`; nothing leaves your machine.
- **Installs never overwrite.** An existing target raises `target_exists`; there
  is no `--force`.
- **Metadata only.** OOMPF indexes metadata and validation results; the canonical
  artifact stays at its public Gist.

## Links

- Documentation: [https://oompf.run/docs/](https://oompf.run/docs/)
- Repository: [grosspoetrysystems/oompf](https://github.com/grosspoetrysystems/oompf)
- Issues: [https://github.com/grosspoetrysystems/oompf/issues](https://github.com/grosspoetrysystems/oompf/issues)

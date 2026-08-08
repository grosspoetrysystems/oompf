# OOMPF v0 Research

Date: 2026-08-08

## Confirmed local environment

- Repository was empty at investigation time.
- `omp` is installed at `/Users/kd-m2air/.bun/bin/omp` and reports `omp/17.2.11`.
- The installed package resolves to `@oh-my-pi/pi-coding-agent`.
- OMP supports `--profile=<value>` and `OMP_PROFILE`/`PI_PROFILE` profile selection.
- Local named profiles exist under `~/.omp/profiles/`: `daily-driver`, `local-only`, `metered-lab`, `metered-lab-glm`, `metered-lab-kimi`, `teacher`, and `work` (the `work` directory currently lacks an agent config).
- Active profile-scoped configuration is stored at `~/.omp/profiles/<name>/agent/config.yml`.
- The default/global configuration is stored at `~/.omp/agent/config.yml`.
- Profile configuration is YAML. Observed fields include `symbolPreset`, `theme`, `setupVersion`, `defaultThinkingLevel`, `disabledProviders`, `enabledModels`, `modelRoles`, `retry`, `advisor`, `memory`, `mnemopi`, and `inspect_image`.
- `modelRoles` contains role-to-model mappings such as `default`, `smol`, `slow`, `plan`, `designer`, `vision`, `task`, `advisor`, `tiny`, and `commit`.
- `retry.fallbackChains` contains ordered fallback model lists.
- `advisor.enabled`, `advisor.subagents`, and `advisor.syncBacklog` are present in observed profiles.
- OMP exposes prewalk behavior through CLI flags (`--prewalk`, `--no-prewalk`, `--prewalk-into`) and a `prewalk` setting exists in the installed source/type surface. No profile-local prewalk setting was observed in the sampled YAML files.
- OMP exposes hooks/extensions via `--hook`, `--extension`, and extension discovery. A local teacher hook exists at `~/.omp/agent/teacher/teacher-hook.ts`; this is machine-local and should not be included in a shareable profile by default.
- OMP's CLI help describes `--config=<value>` overlays, but no profile-specific standalone share/export command was found in the inspected help output.

## Confirmed GitHub tooling

- `gh` is installed, version `2.97.0`.
- `gh auth status` confirms an authenticated GitHub account with `gist`, `repo`, and `workflow` scopes. The username/token are intentionally not recorded here.
- `gh gist create` supports public Gists with `--public`, descriptions with `--desc`, explicit stdin filenames with `--filename`, and multiple files.
- Gists are secret by default; OOMPF publishing MUST pass `--public`.
- `gh repo create` supports public repositories, descriptions, source directories, and push workflows.

## Confirmed framework/deployment research

- Incur is available as `/wevm/incur` in Context7. Its documented pattern uses `Cli.create`, typed Zod argument/option schemas, command registration, and `cli.serve()`.
- Incur supports structured output schemas and `--json`/format-oriented output according to its documentation.
- Astro's official Cloudflare deployment guidance supports full-stack/on-demand rendered sites on Cloudflare Workers using `@astrojs/cloudflare` and Wrangler. The documented deployment commands are `astro build` followed by `wrangler deploy`.
- Astro's Cloudflare guidance notes that runtime dependencies must be compatible with Cloudflare Workers/Node compatibility mode. This matters for the database driver and GitHub-fetching code.

## Confirmed source-level OMP behavior

- Installed OMP source comments state that native user configuration is profile-scoped and that `getAgentDir()` resolves to the active profile's agent directory, equivalent to `~/.omp/profiles/<name>/agent`.
- Profile selection is bootstrapped before modules read the agent directory, confirming that profile selection changes the configuration root rather than merely changing a display name.

## Assumptions requiring explicit implementation decisions

- The canonical shareable artifact for v0 will be the complete `agent/config.yml` for a selected named profile, excluding sibling databases, caches, logs, credentials, auth-broker state, and machine-local hook files unless a later investigation proves they are required for execution.
- OOMPF will preserve native OMP YAML rather than define a replacement profile schema. Zod validation will validate the observed supported shape and retain unknown YAML keys for forward compatibility where practical.
- Profile installation must ask OMP itself for the target agent directory (`omp --profile <name> config path`) or use the equivalent official resolver behavior; hardcoding `~/.omp` is not portable.
- The initial index will use Postgres through Drizzle. Cloudflare Workers compatibility of the chosen Postgres client must be confirmed during implementation; a Workers-compatible HTTP/WebSocket driver is preferred over a Node-only TCP driver.
- The first publishing target will be public GitHub Gists because observed profiles are single YAML files. GitHub repositories will be indexed as external sources but may initially require an explicit canonical file convention.
- The OOMPF web application will be Astro on Cloudflare Workers; the CLI will be Bun + TypeScript and share domain/schema code where the package layout permits.
- GitHub source fetching and registration will be server-side and must never copy canonical profile contents into an OOMPF-owned permanent blob store.

## Open questions for design

1. Exact OMP profile installation/write behavior and collision handling.
2. Canonical repository artifact discovery rules for multi-file repositories.
3. Secret scanning policy and machine-local value detection.
4. Stable profile ID generation and duplicate-source/revision handling.
5. Cloudflare-compatible Drizzle/Postgres driver selection.

## Additional confirmed upstream behavior

- OMP's canonical profile environment variable is `OMP_PROFILE`; `PI_PROFILE` is a legacy fallback. An explicit empty `OMP_PROFILE` selects the default profile.
- OMP accepts `PI_CONFIG_DIR` for the config root and `PI_CODING_AGENT_DIR` for the default agent-directory override. Named profiles derive their own profile directory and do not use the default agent-directory override.
- OMP profile names are constrained to lowercase ASCII letters/digits plus `.`, `_`, and `-`, must start with a lowercase letter or digit, are limited to 64 characters, cannot be `.`/`..`, cannot end in `.`, and cannot be Windows reserved device names such as `CON`, `PRN`, `AUX`, `NUL`, `COM1`, or `LPT1`.
- OMP supports `config.yml` as the canonical settings filename and `config.yaml` as a fallback. Older JSON settings can be migrated into YAML.
- OMP merges the profile/global settings layer with project settings from the current working directory; project settings win over global settings. A published profile therefore captures the profile layer, not every project-local effective setting.
- OMP loads `.env` files from the project, agent, config-root, and home locations. These files can affect runtime behavior and may contain secrets; they are machine/environment inputs, not safe profile artifacts.
- OMP's own settings schema and migrations are implemented in the upstream TypeScript source and can change with OMP releases. OOMPF's Cloudflare indexer cannot depend on a locally installed OMP binary, so server validation must be distinguished from local OMP validation.
- OMP is advertised for macOS, Linux, and Windows and has platform-specific path, shell, XDG, and reserved-name behavior. OOMPF must use platform path APIs and OMP's resolver rather than constructing paths from POSIX assumptions.

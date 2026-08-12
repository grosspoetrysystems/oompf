# What a shared OMP profile can express

Date: 2026-08-12

This note answers GPS-112 against two explicit anchors:

- installed runtime: OMP `17.2.11`;
- upstream source snapshot: `can1357/oh-my-pi` commit [`06aecdd51f07e689e970ceaa180abe2be0c14bbb`](https://github.com/can1357/oh-my-pi/tree/06aecdd51f07e689e970ceaa180abe2be0c14bbb).

The supplied `oh-my-pi-advanced-profiles-research.md` was used as an input. Claims below were checked against OMP source, OMP documentation, or isolated runtime probes. Recommendations are labeled as recommendations.

## Bottom line

An OMP named profile is an isolated OMP user environment, not one YAML file. Selecting a profile relocates settings, agents, rules, prompts, hooks, tools, extensions, skills, MCP definitions, context files, sessions, blobs, and `agent.db`. OMP documents that boundary in [Configuration Discovery and Resolution](https://github.com/can1357/oh-my-pi/blob/06aecdd51f07e689e970ceaa180abe2be0c14bbb/docs/config-usage.md#profiles).

OOMPF v0 publishes only `<profile>/agent/config.yml`. That file can express a large settings policy, but it cannot reproduce the whole named-profile environment. A shared OOMPF profile can carry model routing, retry policy, advisor switches, tool policy, compaction, memory selection, appearance, and hundreds of other settings. It cannot carry custom agent prompts, WATCHDOG files, MCP servers, custom models, extension code, hooks, stored authentication, or memory/session state unless those become separate artifacts in a future design.

At the pinned upstream snapshot:

- `SETTINGS_SCHEMA` defines **452 recognized setting paths** under **130 top-level YAML keys**;
- the settings-file loader accepts any mapping key and does not apply general schema validation;
- unknown keys are merged and preserved but ignored by the core `Settings.get()` API;
- `omp config set` is stricter than direct YAML editing: it rejects unknown paths and validates booleans, numbers, enums, arrays, and records;
- a handful of settings have extra runtime validators, so a file can still fail after parsing.

This distinction matters to OOMPF. “OMP parsed the file” does not mean “OMP validated every value,” and “the file is a complete profile” is false for a config-only artifact.

## Canonical recognized settings

The source of truth is [`SETTINGS_SCHEMA`](https://github.com/can1357/oh-my-pi/blob/06aecdd51f07e689e970ceaa180abe2be0c14bbb/packages/coding-agent/src/config/settings-schema.ts#L388-L5573). `SettingPath` is `keyof` that object, and the config CLI derives its key inventory from the same object.

The schema contains 452 unique paths: 174 booleans, 117 numbers, 83 enums, 45 strings, 25 arrays, and 8 records. Taking the first segment of each dotted path produces these 130 recognized top-level keys:

```text
advisor                   ask                       astEdit                   astGrep                   async
auth                      autoResume                autocompleteMaxVisible    autolearn                 bash
bashInterceptor           branchSummary             browser                   checkpoint                codexResets
collab                    colorBlindMode            commands                  commit                    compaction
completion                computer                  contextPromotion          cycleOrder                debug
defaultThinkingLevel      dev                       disabledExtensions        disabledProviders         display
doubleEscapeAction        edit                      emojiAutocomplete         enabledModels             error
eval                      exa                       extensions                externalThinking          features
fetch                     followUpMode              gc                        generate_image            git
github                    glob                      goal                      grep                      hideThinkingBlock
hindsight                 images                    includeModelInPrompt      includeWorkspaceTree      inlineToolDescriptors
inspect_image             interruptMode             irc                       julia                     launch
live                      loop                      lsp                       magicKeywords             marketplace
mcp                       memories                  memory                    minP                      mnemopi
model                     modelProviderOrder        modelRoleStorage          modelRoles                modelTags
omitThinking              paste                     personality               plan                      power
presencePenalty           prewalk                   proseOnlyThinking         provider                  providers
python                    read                      readLineNumbers           recap                     repetitionPenalty
retry                     ruby                      searxng                   secrets                   security
setupVersion              share                     shellMinimizer            shellPath                 showHardwareCursor
skills                    snapcompact               speech                    speechgen                 startup
statusLine                steeringMode              stt                       symbolPreset              task
tasks                     temperature               terminal                  textVerbosity             theme
thinkingBudgets           tier                      title                     todo                      tools
topK                      topP                      treeFilterMode            tts                       ttsr
tui                       vault                     web_search                workspace                 worktree
```

“Recognized” is the precise word. The loader has no key allow-list, so other top-level keys are syntactically accepted. They do not become OMP settings merely by being present.

### Version drift

The installed `17.2.11` runtime returned 450 paths from `omp config list --json`. Compared with the pinned source schema, it omitted `externalThinking` and `searxng.safesearch`. This is expected upstream drift and is why OOMPF should attach every explanation/default set to an OMP version or source revision.

The schema, not a sampled set of local profiles, is the re-derivable inventory. The six configured local profiles exercise a small fraction of it.

## What OMP validates

OMP uses different validation paths for direct file loading and `omp config set`.

| Input path | Observed behavior |
| --- | --- |
| YAML syntax | Invalid YAML fails startup. |
| Root value | A scalar or sequence fails; OMP moves the invalid file to `config.yml.broken-<timestamp>-<pid>-<uuid>`. |
| Unknown top-level key | Accepted, merged, and preserved. Core settings reads ignore it. |
| Unknown nested key | Accepted, merged, and preserved. Core settings reads ignore it. |
| Wrong type in `config.yml` | Generally accepted as raw data. A configured string can be returned where the schema says boolean. |
| Invalid enum in `config.yml` | Generally accepted as raw data. A configured unknown enum string can be returned unchanged. |
| `omp config set <unknown>` | Rejected with `Unknown setting`. |
| `omp config set` wrong boolean/enum/number | Rejected using schema-derived parsing. |
| Targeted runtime validator | May reject a parsed mapping later. `providers.maxInFlightRequests` rejects non-positive values. |

Source evidence:

- file parsing checks only YAML syntax and a mapping root in [`settings.ts`](https://github.com/can1357/oh-my-pi/blob/06aecdd51f07e689e970ceaa180abe2be0c14bbb/packages/coding-agent/src/config/settings.ts#L1088-L1117);
- path lookup reads a raw configured value or falls back to the schema default in [`Settings.get`](https://github.com/can1357/oh-my-pi/blob/06aecdd51f07e689e970ceaa180abe2be0c14bbb/packages/coding-agent/src/config/settings.ts#L476-L521);
- deep merge iterates every object key rather than filtering through the schema in [`#deepMerge`](https://github.com/can1357/oh-my-pi/blob/06aecdd51f07e689e970ceaa180abe2be0c14bbb/packages/coding-agent/src/config/settings.ts#L2189-L2237);
- CLI value parsing is schema-driven in [`config-cli.ts`](https://github.com/can1357/oh-my-pi/blob/06aecdd51f07e689e970ceaa180abe2be0c14bbb/packages/coding-agent/src/cli/config-cli.ts#L124-L229).

Isolated probes against OMP `17.2.11` confirmed the distinction:

- a file containing `oompf:` and `bogus:` loaded successfully;
- `retry.unknownChild` was ignored while `retry.enabled` kept its default;
- `retry.enabled: nope` loaded and `omp config get retry.enabled` printed `nope`;
- `defaultThinkingLevel: impossible` loaded and was returned unchanged;
- `omp config set defaultThinkingLevel impossible`, `omp config set retry.enabled nope`, and `omp config set bogus 1` all failed;
- `providers.maxInFlightRequests.openai: -2` failed with `Provider request limits must be positive numbers: openai`.

The current namespaced `oompf:` metadata block is therefore a no-op to OMP `17.2.11`, not an OMP setting. OOMPF should keep the namespace narrow and continue preserving unknown keys for forward compatibility. It should not imply that arbitrary unknown keys define portable OMP behavior.

## Precedence and merge behavior

OMP documents the effective settings order as:

```text
built-in defaults
  <- active global/profile config
  <- project config
  <- CLI config overlays, in order
  <- runtime overrides and dedicated flags
```

Objects deep-merge. Scalars and arrays replace the lower value wholesale. See [Settings: Precedence and merge rules](https://github.com/can1357/oh-my-pi/blob/06aecdd51f07e689e970ceaa180abe2be0c14bbb/docs/settings.md#precedence).

A `null` value replaces the lower object or scalar. For a known child beneath a nulled object, `Settings.get()` cannot find a configured value and returns that child’s built-in default. In an isolated probe, a profile set `retry.enabled: false`; an overlay set `retry: null`; the effective `retry.enabled` became the default `true`. This is the tombstone behavior OOMPF’s overlay rendering must explain.

A second probe set `disabledProviders: [anthropic, openai]` in the profile and `[groq]` in an overlay. The effective value was `['groq']`, proving replacement rather than concatenation.

## Portability classes

“Portable” means the value describes intent on another machine. It does not guarantee that the target machine has the required provider, model, executable, service, or file.

### Portable policy

These families are useful in a shared settings profile when their values do not embed machine references:

- model and reasoning policy: `modelRoles`, `modelTags`, `cycleOrder`, `defaultThinkingLevel`, `thinkingBudgets`, sampling, verbosity, and service tiers;
- orchestration policy: `task.maxConcurrency`, `task.agentModelOverrides`, `task.agentPrewalk`, advisor switches, prewalk, retry, and fallback chains;
- context policy: compaction, context promotion, TTSR engine settings, and local-memory policy;
- safety policy: tool enablement, approval modes, bash approval patterns, timeouts, and task isolation;
- interaction and presentation: theme, symbols, display, status line, input behavior, and terminal preferences.

Some of these are low-value for OOMPF rendering, but they remain valid portable settings.

### Conditionally portable

These values are meaningful elsewhere only when the recipient satisfies a prerequisite:

| Setting or value | Required prerequisite |
| --- | --- |
| Model selectors in `modelRoles`, `enabledModels`, task overrides, or fallback chains | Matching model catalog plus provider authentication or a keyless provider. |
| `ollama/...`, llama.cpp, LM Studio, vLLM, oMLX, or local tiny-model selectors | Compatible local runtime, model, endpoint, and often hardware. |
| `disabledProviders`, provider order, search/image provider order | Same provider identifiers and capabilities on the target OMP build. |
| `extensions`, custom skill/command directories, shell/eval/LSP settings | Referenced packages, files, binaries, runtimes, and platform support. |
| Browser/computer settings | Browser/CDP relay or OS permissions and a compatible display. |
| `memory.backend: local` | Persisted sessions and a usable model for extraction/consolidation. The memory contents do not travel with `config.yml`. |
| `memory.backend: hindsight` or `mnemopi` | Reachable service/database, credentials, models, and existing state. |
| MCP discovery toggles | An `mcp.json` definition and separate authentication state. |
| Advisor roster behavior | `WATCHDOG.yml` and `WATCHDOG.md` when the setup uses more than the default single advisor. |
| TTSR behavior | Discovered rule files. `ttsr.*` config controls the engine but does not contain the rules. |

Path-scoped `enabledModels` and `disabledProviders` entries are a path-level exception: bare entries describe portable policy, while `path`, `paths`, `pathPrefix`, and `pathPrefixes` bind behavior to a local filesystem layout.

### Machine-local or secret-bearing

Never publish these values as ordinary profile data:

- credential-marked settings: `auth.broker.token`, `mnemopi.embeddingApiKey`, `mnemopi.llmApiKey`, `hindsight.apiToken`, `searxng.token`, `searxng.basicPassword`, and `dev.autoqaPush.token`;
- local endpoints and paths such as `auth.broker.url`, `shellPath`, `python.interpreter`, `mnemopi.dbPath`, `shellMinimizer.settingsPath`, browser CDP/relay URLs, and localhost/LAN service URLs;
- provider credentials, headers, or command-based credential resolvers in `models.yml`;
- MCP secrets, headers, environment values, executable commands, working directories, callback ports, and local endpoints in `mcp.json`;
- `.env`, `secrets.yml`, `agent.db`, auth-broker state, sessions, blobs, databases, and caches;
- hook, extension, plugin, or custom-tool code. These are executable dependencies, not inert settings.

OMP marks credential settings in the schema and redacts configured values from `omp config list --json`. An isolated probe returned `{ "redacted": true }` for a configured `auth.broker.token`. OOMPF’s broader key/value secret scan remains necessary because credentials can also appear in records and in separate artifacts.

## Advanced settings surface

| Surface | What `config.yml` can express | What remains outside the file | Reproducibility note |
| --- | --- | --- | --- |
| Model routing | Built-in and custom `modelRoles`, role aliases, provider order, enabled models, effort suffixes. | Provider auth and custom provider/model definitions in `models.yml`. | Selector text is portable; availability and supported effort levels are not. |
| Task agents | Concurrency, disabled agents, model overrides, effort/prewalk/isolation policy. | Agent prompts, tools, spawn policy, and prioritized model lists in `agents/*.md`. | `task.agentModelOverrides[agentName]` wins over agent frontmatter, then parent model fallback. |
| Retry and fallback | Retry counts/backoff, revert policy, and role/model/provider fallback chains. | Provider availability and credentials. | Role chains, exact model keys, and `provider/*` keys have different matching behavior; unresolved selectors warn at startup. |
| Advisor | Enablement, subagent policy, backlog sync, immune turns, advisor role, and service tier. | `WATCHDOG.md` guidance and multi-advisor `WATCHDOG.yml` roster/tool grants. | Enabling an unresolved advisor yields `no_model`; granting mutating advisor tools changes the risk profile. |
| Prewalk | Session prewalk and per-agent prewalk settings/targets. | Agent-frontmatter prewalk declarations. | A missing target is skipped; a same-model effort change can still be a real handoff. |
| TTSR | Engine enablement, context/interrupt/repeat policy, builtin/disabled rule selection. | The discovered rule definitions and their regex/AST content. | Shipping `ttsr.*` without rules reproduces policy, not behavior. |
| Memory | Backend choice, retention/recall budgets, concurrency, endpoint paths, and feature switches. | Session history, generated summaries/skills, local databases, remote banks, and credentials. | A config-only install starts with empty or unreachable memory state. |
| Hooks/extensions/plugins | Discovery toggles and extension references. | Executable code and package dependencies. | A path/reference alone is not reproducible and may execute untrusted code. |
| MCP | Discovery/runtime switches. | Server definitions in `mcp.json` and credentials in profile state/broker. | Config-only sharing does not reproduce MCP access. |
| Tools/security | Tool availability, approval policy, command patterns, limits, and isolation. | OS permissions, executables, and extension-provided tools. | `yolo` or broad allow rules are portable but security-sensitive and deserve an explicit warning. |

Primary references:

- [Settings](https://github.com/can1357/oh-my-pi/blob/06aecdd51f07e689e970ceaa180abe2be0c14bbb/docs/settings.md)
- [Task agent discovery and model precedence](https://github.com/can1357/oh-my-pi/blob/06aecdd51f07e689e970ceaa180abe2be0c14bbb/docs/task-agent-discovery.md#model-and-structured-output-precedence)
- [Advisor and WATCHDOG](https://github.com/can1357/oh-my-pi/blob/06aecdd51f07e689e970ceaa180abe2be0c14bbb/docs/advisor-watchdog.md)
- [TTSR injection lifecycle](https://github.com/can1357/oh-my-pi/blob/06aecdd51f07e689e970ceaa180abe2be0c14bbb/docs/ttsr-injection-lifecycle.md)
- [Autonomous memory](https://github.com/can1357/oh-my-pi/blob/06aecdd51f07e689e970ceaa180abe2be0c14bbb/docs/memory.md)
- [Models and custom providers](https://github.com/can1357/oh-my-pi/blob/06aecdd51f07e689e970ceaa180abe2be0c14bbb/docs/models.md)
- [MCP configuration](https://github.com/can1357/oh-my-pi/blob/06aecdd51f07e689e970ceaa180abe2be0c14bbb/docs/mcp-config.md)

## A useful capability template

The following is a good schematic starting point. It demonstrates the part of the surface that makes a shared config interesting: semantic roles, explicit task-agent routing, bounded fan-out, independent review, fallback topology, and provider pressure limits.

It is not copy-ready. Every placeholder must resolve through `omp models`; each effort suffix must be supported by the selected model; task-agent effort suffixes only take effect when `task.enableEffort` is enabled and remain capped by `task.maxEffort`; provider authentication and local runtimes remain external prerequisites.

```yaml
modelRoles:
  # Main loop
  default: <subscription-provider>/<main-model>:high
  task: <subscription-provider>/<main-model>:high

  # Research/support
  smol: <subscription-or-cheap-provider>/<research-model>:medium

  # High-consequence escalation
  plan: <metered-provider>/<frontier-model>:xhigh
  slow: <metered-provider>/<frontier-model>:xhigh

  # Specialized
  designer: <design-provider>/<design-model>:high
  vision: <vision-provider>/<vision-model>:high

  # Background
  commit: <local-or-cheap-provider>/<fast-model>:low
  tiny: <local-or-cheap-provider>/<fast-model>:minimal

  # Continuous reviewer
  advisor: <independent-provider>/<review-model>:high

  # Semantic orchestration roles
  research_worker: <subscription-or-cheap-provider>/<research-model>:medium
  implementation_worker: <subscription-provider>/<main-model>:high
  deep_reviewer: <metered-provider>/<frontier-model>:xhigh

task:
  maxConcurrency: 4
  agentModelOverrides:
    scout: "@research_worker"
    librarian: "@research_worker"
    task: "@implementation_worker"
    reviewer: "@deep_reviewer"
    security-reviewer: "@deep_reviewer"

advisor:
  enabled: true
  subagents: false

retry:
  enabled: true
  modelFallback: true
  fallbackRevertPolicy: cooldown-expiry
  fallbackChains:
    default:
      - <alternate-subscription-provider>/<alternate-model>:high
      - <metered-provider>/<frontier-model>:high
    plan:
      - <alternate-frontier-provider>/<alternate-frontier-model>:xhigh
    slow:
      - <alternate-frontier-provider>/<alternate-frontier-model>:xhigh

providers:
  maxInFlightRequests:
    <subscription-provider>: 4
    <metered-provider>: 2
```

Why this shape is valid:

- custom role names such as `research_worker` can be stored in `modelRoles` and referenced as `@research_worker`;
- task dispatch model precedence is `task.agentModelOverrides[agentName]`, then agent frontmatter, then the parent’s active/configured model;
- the `default` fallback chain applies to roles without an explicit chain, including the semantic worker roles above; exact model, provider wildcard, hinted role, assigned-model role, and `default` matches have distinct precedence;
- `advisor.subagents: false` prevents review traffic from multiplying across every spawned agent;
- `task.maxConcurrency: 4` bounds concurrent subagents (`0` means unlimited), while `providers.maxInFlightRequests` values must be positive, so the example’s limits are structurally coherent.

One redundancy is intentional but worth knowing: the explicit `task.agentModelOverrides.task` entry controls the bundled `task` agent before a general `modelRoles.task` mapping can matter. Keep both only when another consumer uses the `task` role; otherwise the role mapping can be removed.

This template shows routing possibility, not the whole profile ceiling. It deliberately leaves out tool approvals, TTSR rule files, memory backends, custom agent definitions, WATCHDOG policy, MCP, hooks, and extensions. Adding those without their companion artifacts would make the profile look richer while making it less reproducible.

## Profile-scoped artifacts outside `config.yml`

| Artifact | Profile-scoped by OMP | Included by OOMPF v0 | Risk if omitted |
| --- | --- | --- | --- |
| `models.yml` | Yes | No | Custom providers/models and their resolution disappear. |
| `agents/*.md` | Yes | No | Custom agent behavior and model lists disappear. |
| `WATCHDOG.md` / `WATCHDOG.yml` | Yes | No | Advisor guidance, roster, and tool grants disappear. |
| `mcp.json` | Yes | No | MCP servers and bindings disappear. |
| rules/TTSR files | Yes | No | TTSR settings remain but no custom rules run. |
| `hooks/`, `extensions/`, `plugins/`, custom tools | Yes | No | Referenced executable behavior is missing. |
| skills, commands, prompts, context files | Yes | No | Workflow and instruction layers disappear. |
| `agent.db`, sessions, blobs, memory state | Yes | No, intentionally | Auth and local state do not travel; the recipient starts fresh. |
| project `.omp/` and project context files | No; project-scoped | No | Repository-specific policy still comes from the target project. |

## Recommendations for OOMPF

### Render first-class

1. `modelRoles`, including custom semantic roles and effort suffixes.
2. `task.agentModelOverrides`, concurrency, prewalk, and isolation.
3. Retry/fallback topology, with role/model/provider keys distinguished.
4. Advisor enablement, role, subagent policy, and missing WATCHDOG prerequisites.
5. Enabled/disabled model/provider policy and target-machine availability.
6. Tool approval posture, executable extensions/hooks, and other security-sensitive behavior.
7. Memory backend choice and the fact that memory data is absent.
8. Overlay tombstones and array replacement.

### Give a section reference

- thinking levels, budgets, sampling, and service tiers;
- compaction and context promotion;
- prewalk;
- TTSR engine policy versus rule artifacts;
- memory backends;
- provider/model selection and local-runtime prerequisites;
- appearance settings that occur frequently in real profiles, such as `theme` and `symbolPreset`.

### Warn or actively discourage

- credential-marked values and any high-confidence credential-like key/value;
- absolute paths, localhost/LAN endpoints, executable commands, callback ports, device selectors, and database paths;
- `yolo`/broad approval rules without an explicit security callout;
- hook, extension, plugin, or custom-tool references without a reviewable companion artifact;
- local-model selectors without a declared runtime/model prerequisite;
- memory/MCP/advisor claims that depend on missing sibling artifacts;
- unknown keys outside a project-owned namespace. Preserve them, but do not explain them as OMP behavior.

### Product wording

OOMPF should say that it currently indexes and shares an **OMP settings artifact**. Calling that one file a complete OMP named profile overstates reproducibility. The distinction belongs in GPS-111’s “What OOMPF is and is not” page and on profile pages when the config references missing profile-scoped artifacts.

## How to re-derive this audit

For a future OMP revision:

1. Pin an OMP commit or release and record the local `omp --version`.
2. Parse the `SETTINGS_SCHEMA` object in `packages/coding-agent/src/config/settings-schema.ts`; its property names are the canonical paths.
3. Count unique paths, then split each dotted path at the first `.` to derive top-level keys.
4. Compare with `omp config list --json` on the target runtime. Investigate differences instead of assuming source and installed versions match.
5. Read the settings loader and config CLI separately. File-load leniency and CLI-set strictness are different contracts.
6. Re-run isolated-home probes for unknown keys, malformed values, targeted validators, overlay `null`, and array replacement.
7. Re-check profile relocation and every sibling artifact in `docs/config-usage.md`.
8. Classify new paths using source credential markers plus path/endpoint/executable/provider prerequisites.

Do not derive support from local-profile frequency. Frequency helps prioritize documentation; it does not define OMP’s accepted surface.

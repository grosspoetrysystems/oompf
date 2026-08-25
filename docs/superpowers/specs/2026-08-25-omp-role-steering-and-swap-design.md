# OMP Role Steering, Plugin Control, and OOMPF Profile Handoff

Date: 2026-08-25  
Status: design spike; no implementation in this repository

## Decision summary

1. **Warm role switching belongs in OMP.** OMP already exposes enough extension surface for a loaded TypeScript extension to resolve a configured role alias (`@slow`) and set the current session model and thinking level.
2. **A role-group plugin already exists.** [Artimunor/omp-role-switcher](https://github.com/Artimunor/omp-role-switcher) saves and loads named `modelRoles` presets, supports project/global scope, clears stale roles in the target layer, backs up unsaved current roles, and switches the live session to the preset's `default` model/thinking level.
3. **Role enumeration is still the missing stable API.** The plugin reaches internal `pi.pi.settings` methods (`getModelRoles`, `setModelRole`, `setProjectModelRole`, and `flush`) and parses effort suffixes itself. Add a supported `getModelRoles()` and `setActiveRole()` upstream so portable extensions do not depend on internal APIs or duplicate config semantics.
4. **Use an ampersand palette for turn-scoped steering.** Proposed UX: `&` opens a soft role picker; `&slow prompt` applies `slow` to the current turn. Match only at prompt start or as a standalone token so shell/code ampersands stay literal.
5. **Task roles must be explicit.** A parent role should not silently overwrite child-agent routing. Add a per-dispatch role override to OMP task orchestration; preserve agent definitions such as `model: "@review"` as the default.
6. **Whole-profile swap remains cold.** OOMPF can install a verified named profile and emit `omp --profile <name>`. Replacing the active profile in a running process would require OMP to rebuild profile-scoped settings, providers, auth paths, discovery, tools, extensions, and session state.
7. **Plugin reload is scope-limited.** `/reload-plugins` is the right follow-up for skills, slash commands, and MCP. The marketplace contract requires a restart for newly installed tools, hooks, and TypeScript extension modules.

## Evidence from current OMP

### Session model mutation

The built-in `/model` command resolves an available model and calls the live session's `setModel` method. The extension API exposes the corresponding controls:

- `ctx.models.list()` — authenticated models available in the session;
- `ctx.models.current()` — current session model;
- `ctx.models.resolve("@slow")` — resolve a concrete selector or configured role alias;
- `pi.setModel(model)` — set the current session model;
- `pi.setThinkingLevel(level)` — set the current session thinking level;
- `pi.registerCommand(...)` and `pi.registerShortcut(...)` — add user-facing controls.

This makes a named-role plugin feasible today. The remaining limitation is discovering arbitrary role names and applying their configured effort suffixes without parsing `config.yml` independently.

Primary sources:

- [OMP extension API types](https://github.com/can1357/oh-my-pi/blob/main/packages/coding-agent/src/extensibility/extensions/types.ts)
- [OMP extension guide](https://github.com/can1357/oh-my-pi/blob/main/docs/extensions.md)
- [Built-in model command](https://github.com/can1357/oh-my-pi/blob/main/packages/coding-agent/src/slash-commands/builtin-modes.ts)
- [OMP settings and model roles](https://github.com/can1357/oh-my-pi/blob/main/docs/settings.md)
- [Upstream role API request](https://github.com/can1357/oh-my-pi/issues/1231)

### Verified role-preset plugin

The role-switcher plugin validates the proposed role-group behavior in a real
OMP extension:

- `/save-roles <name>` snapshots the effective `modelRoles`;
- `/load-roles [name]` provides a picker and tab completion;
- `--local` writes the project layer; `--global` writes the global layer;
- stale roles in the targeted layer are cleared;
- an unsaved current loadout is preserved as a rolling `backup` preset;
- the live session switches to the preset's `default` model and thinking suffix.

It is a working complementary plugin, not a hypothetical design. Its remaining
technical debt is that it depends on internal `pi.pi.settings` APIs and parses
thinking suffixes itself. The upstream role API ticket should stabilize that
contract rather than replace the plugin's user-facing behavior.

Source: [Artimunor/omp-role-switcher](https://github.com/Artimunor/omp-role-switcher).

### Task and subagent routing

OMP task agents already support role aliases in agent definitions and model precedence. A custom agent can declare:

```yaml
---
name: reviewer
description: Review a change for correctness.
model: "@review"
---
```

`task.agentModelOverrides` can route named agents through semantic roles such as `@research_worker`, `@implementation_worker`, and `@deep_reviewer`. OMP also has bounded concurrency, blocking/async execution, Agent Hub inspection, and steering of running children.

The target OMP build is reported to expose `/tan` as a background tangential
task flow whose default model set is the `task` role. The public upstream ref
searched for this spike did not expose `/tan`, so the exact command/source
still needs to be pinned before implementation. Assuming the reported flow is
task-backed, it should consume the same explicit per-dispatch role field rather
than inventing another routing system.

Primary source: [Task Agent Discovery and Selection](https://github.com/can1357/oh-my-pi/blob/main/docs/task-agent-discovery.md).

### Marketplace and reload scope

OMP marketplace installs can provide skills, commands, agents, tools, hooks, MCP, and extension modules. The documented reload boundary is narrow:

- TUI marketplace mutations update disk state and invalidate discovery caches;
- `/reload-plugins` refreshes skills, slash commands, and MCP;
- newly installed tools, hooks, and extension modules require an OMP session restart;
- an already-loaded extension command can mutate the current model live through the extension API;

Primary source: [OMP marketplace documentation](https://github.com/can1357/oh-my-pi/blob/main/docs/marketplace.md).

## Proposed surfaces

### OMP core

```text
&                       → open role picker
&slow Explain this      → apply @slow to the current turn
```

The picker should show the effective role definition:

```text
Select model role

> default   anthropic/claude-sonnet-4-5
  slow      anthropic/claude-opus-4-5:high
  smol      openai/gpt-4.1-mini
  review    openai/gpt-5.4:high
```

Proposed API:

```ts
ctx.models.listRoles(): readonly RoleInfo[];
pi.setActiveRole(name, { scope: "turn" | "session" }): Promise<boolean>;
```

`RoleInfo` must carry the role name, resolved model, and effective thinking level. The first implementation should be turn-scoped; persistence belongs to `/settings` and existing configuration flows.

### OMP task orchestration

Add an explicit role/model selector to task dispatch. The exact field name is an upstream API decision; the behavior should be:

```json
{
  "agent": "reviewer",
  "role": "deep_reviewer",
  "task": "Review the migration"
}
```

Precedence should remain explicit:

1. invocation-local role/model override;
2. `task.agentModelOverrides[agentName]`;
3. agent frontmatter `model` list;
4. parent fallback.

The parent turn's `&slow` selection must not implicitly remap every child.

### Optional marketplace extension

The first practical implementation is [Artimunor/omp-role-switcher](https://github.com/Artimunor/omp-role-switcher), which already provides named role-group presets through `/save-roles` and `/load-roles`. Install it from its marketplace catalog, restart once so the TypeScript extension loads, then use its picker and project/global scope.

The plugin should become a reference consumer of the supported role API once
OMP exposes it. A zero-argument dynamic `&` palette should not require every
extension to hardcode OMP role names or maintain a second YAML parser.

### OOMPF cold handoff

OOMPF should stay responsible for verified profile distribution, not the live OMP session. A future `oompf swap` may:

1. fetch and verify an OOMPF reference;
2. stage it as a new named native profile;
3. print `omp --profile <name>` as the next action;
4. optionally relaunch only with explicit user opt-in.

The current `oompf add --name <name>` already covers much of the staging path. A swap command should only exist if the relaunch/handoff UX is materially better than that existing command.

## Non-goals

- Do not make OOMPF write arbitrary OMP runtime state behind the user's back.
- Do not treat `/reload-plugins` as a full-profile or model-role reload.
- Do not add a second orchestration runtime to OOMPF.
- Do not claim `/tan` behavior until its exact OMP build or plugin source is confirmed.
- Do not publish executable plugins as ordinary OOMPF profile YAML; plugin code has a separate marketplace and trust boundary.

## Existing related work

- [GPS-154](https://linear.app/grosspoetrysystems/issue/GPS-154/epic-oompf-as-an-agent-profile-interoperability-standard): interoperability umbrella.
- [GPS-155](https://linear.app/grosspoetrysystems/issue/GPS-155/define-the-harness-neutral-profile-schema-portable-core-native): portable role/model schema.
- [GPS-119](https://linear.app/grosspoetrysystems/issue/GPS-119/define-the-installable-full-profile-bundle-and-trust-tiers): multi-file profile and executable trust boundary.
- [GPS-148](https://linear.app/grosspoetrysystems/issue/GPS-148/bring-omp-style-profiles-to-upstream-pi-without-forking-it): named profiles outside OMP.
- [GPS-137](https://linear.app/grosspoetrysystems/issue/GPS-137/bare-gist-installs-write-unverified-bytes): verified OOMPF-only installation policy, now implemented in PR #17.

- [GPS-162](https://linear.app/grosspoetrysystems/issue/GPS-162/add-role-enumeration-and-turn-scoped-activation-to-omp-extensions): OMP extension role enumeration and turn/session activation.
- [GPS-163](https://linear.app/grosspoetrysystems/issue/GPS-163/add-explicit-role-overrides-to-omp-task-agent-dispatch): explicit per-dispatch roles for concurrent task agents.
- [GPS-164](https://linear.app/grosspoetrysystems/issue/GPS-164/add-a-verified-cold-profile-handoff-command): evaluate and, if justified, implement verified cold profile handoff.

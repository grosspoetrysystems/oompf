# Profile-First Publish Selection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `oompf publish [profile]` accept only native OMP profile names, select among omitted profiles interactively when safe, and fail deterministically before remote side effects otherwise.

**Architecture:** Core profile resolution will expose a typed missing-profile error while retaining OMP as the path authority. The CLI will wrap `@clack/prompts` behind one injectable profile-selection seam containing both terminal eligibility and selection, then keep all resolution and validation in `publish.ts` before its existing GitHub and registration calls. Command tests will inject the seam and side-effect counters; production terminal checks stay isolated and directly testable.

**Tech Stack:** TypeScript 5.9, Bun 1.3, Incur 0.4.26, `@clack/prompts` 1.7, Bun test, Astro content Markdown.

## Global Constraints

- Explicit `oompf publish <profile>` input is exclusively a native OMP profile name; there is no filesystem-path fallback.
- Omitted input may prompt only for multiple publishable profiles in human output mode, outside CI, with TTY stdin and stdout.
- JSON and all other explicitly formatted output, CI, and noninteractive execution must never prompt or hang.
- Omitted-input discovery includes only profiles with `config.yml` or `config.yaml`; an explicitly named existing profile without either file returns `missing_config`.
- Local selection, resolution, file validation, and secret scanning must finish before GitHub authentication, Gist creation, or OOMPF registration.
- Stable preflight codes are `invalid_profile`, `profile_not_found`, `missing_config`, `no_profile`, `ambiguous_profile`, and `selection_cancelled`.
- Do not add repeat-publish identity, arbitrary file browsing, overlays, multi-file bundles, or broad GPS-86 documentation work.
- Preserve unrelated workspace changes in `.gitignore`, `.superpowers/sdd/`, and `.superpowers/brainstorm/`; stage only named task files.

---

### Task 1: Typed missing-profile resolution

**Files:**
- Modify: `packages/core/src/omp-profile.ts:63-141`
- Modify: `packages/core/src/omp-profile.test.ts:151-160`
- Modify: `packages/core/src/index.ts:25-38`

**Interfaces:**
- Consumes: existing `resolveProfileConfig(profile: string, options?: OmpProfileOptions): Promise<ResolvedProfileConfig>`.
- Produces: `OmpProfileNotFoundError extends Error` with `readonly profile: string` and `readonly resolvedPath: string`; `resolveProfileConfig` throws this class only when OMP returns an absolute agent directory that is absent.
- Preserves: invalid profile names, OMP subprocess failures, empty/non-absolute OMP output, and resolved file/non-directory paths remain distinct generic errors.

- [ ] **Step 1: Inspect symbol references before changing exported profile resolution behavior**

Use `xd://lsp` with `action: "references"`, `file: "packages/core/src/omp-profile.ts"`, `line: 192`, and `symbol: "resolveProfileConfig"`. Confirm every caller either continues to accept the existing return type or receives the new typed error without an API signature change.

- [ ] **Step 2: Strengthen the missing-profile core test first**

Replace the current missing-directory assertion with a class/property assertion while preserving the message contract:

```ts
import {
  discoverProfiles,
  OmpProfileNotFoundError,
  resolveInstallTarget,
  resolveProfileConfig,
} from "./omp-profile.ts";

// In the missing-profile test:
const missingPath = join(
  tmpdir(),
  "oompf-missing-profile-987654",
  "agent"
);
process.env.OOMPF_STUB_PROFILE_DIR = missingPath;

try {
  await resolveProfileConfig("ghost", { ompCommand: stubCommand });
  throw new Error("Expected resolveProfileConfig to reject");
} catch (error) {
  expect(error).toBeInstanceOf(OmpProfileNotFoundError);
  expect(error).toMatchObject({
    profile: "ghost",
    resolvedPath: missingPath,
  });
  expect((error as Error).message).toMatch(/is not a directory \(missing\)/);
}
```

- [ ] **Step 3: Run the focused core test and confirm the expected red failure**

Run:

```bash
bun test packages/core/src/omp-profile.test.ts
```

Expected: FAIL because `OmpProfileNotFoundError` is not exported or defined.

- [ ] **Step 4: Add the typed error and throw it only for an absent named profile**

Add near the public profile types in `omp-profile.ts`:

```ts
/** A named OMP profile whose resolved agent directory is absent. */
export class OmpProfileNotFoundError extends Error {
  constructor(
    readonly profile: string,
    readonly resolvedPath: string
  ) {
    super(
      `Resolved agent directory for profile "${profile}" is not a directory (missing): "${resolvedPath}".`
    );
    this.name = "OmpProfileNotFoundError";
  }
}
```

In `resolveConfigPath`, split the `requireDirectory` branch so only `kind === "missing" && profile !== null` throws the typed class; retain the existing generic error for `file` and `other`:

```ts
if (requireDirectory) {
  const kind = await statKind(resolved);
  if (kind === "missing" && profile !== null) {
    throw new OmpProfileNotFoundError(profile, resolved);
  }
  if (kind !== "directory") {
    throw new Error(
      `Resolved agent directory for the ${label} is not a directory (${kind}): "${resolved}".`
    );
  }
}
```

Export the class from `packages/core/src/index.ts` beside the profile resolver functions:

```ts
export {
  discoverProfiles,
  OmpProfileNotFoundError,
  resolveInstallTarget,
  resolveProfileConfig,
} from "./omp-profile.ts";
```

- [ ] **Step 5: Run focused tests and typecheck**

Run:

```bash
bun test packages/core/src/omp-profile.test.ts
bun run --filter=@oompf/core typecheck
```

Expected: all profile resolver tests pass and core typecheck exits zero.

- [ ] **Step 6: Commit only the core error contract**

```bash
git add packages/core/src/omp-profile.ts packages/core/src/omp-profile.test.ts packages/core/src/index.ts
git commit -m "fix(core): classify missing OMP profiles"
```

---

### Task 2: Interactive profile-selection seam

**Files:**
- Create: `apps/cli/src/profile-selector.ts`
- Create: `apps/cli/src/profile-selector.test.ts`
- Modify: `apps/cli/src/deps.ts:10-18,83-103,136-148`
- Modify: `apps/cli/package.json:41-43`
- Modify: `bun.lock`

**Interfaces:**
- Consumes: `@clack/prompts` `select<Value>()` and `isCancel()`.
- Produces: `ProfileSelector` with `isInteractive(): boolean` and `selectProfile(names: readonly string[]): Promise<string | null>`.
- Produces: `isInteractiveProfileSession(options)` pure eligibility helper; the default selector supplies `process.stdin.isTTY`, `process.stdout.isTTY`, and `process.env.CI`.
- Produces: `defaultProfileSelector`, wired as `ResolvedDeps.profileSelector` and replaceable through `CliDeps.profileSelector`.

- [ ] **Step 1: Add the direct prompt dependency at the already locked version**

From `apps/cli` run:

```bash
bun add @clack/prompts@1.7.0
```

Expected: `apps/cli/package.json` gains `"@clack/prompts": "1.7.0"` and the workspace lockfile records it as a direct CLI dependency without upgrading unrelated packages.

- [ ] **Step 2: Write eligibility tests before implementation**

Create `apps/cli/src/profile-selector.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { isInteractiveProfileSession } from "./profile-selector.ts";

describe("isInteractiveProfileSession", () => {
  test("allows a TTY session outside CI", () => {
    expect(
      isInteractiveProfileSession({
        ci: undefined,
        stdinIsTTY: true,
        stdoutIsTTY: true,
      })
    ).toBe(true);
  });

  test.each([
    { ci: "1", stdinIsTTY: true, stdoutIsTTY: true },
    { ci: undefined, stdinIsTTY: false, stdoutIsTTY: true },
    { ci: undefined, stdinIsTTY: true, stdoutIsTTY: false },
  ])("rejects noninteractive session %o", (options) => {
    expect(isInteractiveProfileSession(options)).toBe(false);
  });
});
```

- [ ] **Step 3: Run the selector test and confirm the expected red failure**

Run:

```bash
bun test apps/cli/src/profile-selector.test.ts
```

Expected: FAIL because `profile-selector.ts` does not exist.

- [ ] **Step 4: Implement the focused selector wrapper**

Create `apps/cli/src/profile-selector.ts`:

```ts
import { isCancel, select } from "@clack/prompts";

export interface ProfileSelector {
  isInteractive(): boolean;
  selectProfile(names: readonly string[]): Promise<string | null>;
}

interface InteractiveSessionOptions {
  readonly ci: string | undefined;
  readonly stdinIsTTY: boolean | undefined;
  readonly stdoutIsTTY: boolean | undefined;
}

export function isInteractiveProfileSession(
  options: InteractiveSessionOptions
): boolean {
  return (
    options.ci === undefined &&
    options.stdinIsTTY === true &&
    options.stdoutIsTTY === true
  );
}

export const defaultProfileSelector: ProfileSelector = {
  isInteractive: () =>
    isInteractiveProfileSession({
      ci: process.env.CI,
      stdinIsTTY: process.stdin.isTTY,
      stdoutIsTTY: process.stdout.isTTY,
    }),
  selectProfile: async (names) => {
    const selected = await select<string>({
      message: "Select a profile to publish",
      options: names.map((name) => ({ label: name, value: name })),
    });
    return isCancel(selected) ? null : selected;
  },
};
```

Keep cancellation value-only: do not call Clack's process-exit helpers and do not print a second cancellation message.

- [ ] **Step 5: Wire the selector through dependency resolution**

In `apps/cli/src/deps.ts`, import the type and default:

```ts
import {
  defaultProfileSelector,
  type ProfileSelector,
} from "./profile-selector.ts";
```

Add to `CliDeps`:

```ts
/** Interactive native-profile selection seam (publish). */
readonly profileSelector?: ProfileSelector;
```

Add to `resolveDeps`:

```ts
profileSelector: deps.profileSelector ?? defaultProfileSelector,
```

No other command should import Clack or inspect terminal state.

- [ ] **Step 6: Run selector tests and CLI typecheck**

Run:

```bash
bun test apps/cli/src/profile-selector.test.ts
bun run --filter=@grosspoetrysystems/oompf typecheck
```

Expected: selector tests pass and CLI typecheck exits zero.

- [ ] **Step 7: Commit the selector seam and dependency**

```bash
git add apps/cli/src/profile-selector.ts apps/cli/src/profile-selector.test.ts apps/cli/src/deps.ts apps/cli/package.json bun.lock
git commit -m "feat(cli): add interactive profile selector"
```

---

### Task 3: Profile-first publish orchestration

**Files:**
- Modify: `apps/cli/src/commands/publish.test.ts:1-137`
- Modify: `apps/cli/src/commands/publish.ts:14-81`

**Interfaces:**
- Consumes: `OmpProfileNotFoundError` and `validateProfileName` from `@oompf/core`.
- Consumes: `ResolvedDeps.profileSelector.isInteractive()` and `ResolvedDeps.profileSelector.selectProfile(names)`.
- Produces: the command behavior and stable preflight codes in the approved behavior matrix.
- Preserves: all artifact validation, secret scanning, GitHub authentication, Gist creation, registration, and success output after selection.

- [ ] **Step 1: Expand test fixtures to represent multiple profiles and remote call counters**

In `publish.test.ts`, add constants:

```ts
const PLAY_CONFIG_PATH = "/omp/profiles/play/agent/config.yml";
const PLAY_AGENT_DIR = "/omp/profiles/play/agent";
```

Seed both configs in `publishDeps`, and add a helper that records remote calls:

```ts
function remoteCounters() {
  const calls = { http: 0, runner: 0 };
  return {
    calls,
    httpFetch: async (...args: Parameters<NonNullable<CliDeps["httpFetch"]>>) => {
      calls.http += 1;
      return apiFetch()(...args);
    },
    runner: async (...args: Parameters<NonNullable<CliDeps["runner"]>>) => {
      calls.runner += 1;
      return ghRunner()(...args);
    },
  };
}
```

Import `OmpProfileNotFoundError` from `@oompf/core` for the unknown-profile fake.

- [ ] **Step 2: Write failing tests for omitted-input selection**

Add tests with injected `profileSelector` fakes:

```ts
test("selects among multiple publishable profiles interactively", async () => {
  const selected: string[][] = [];
  const deps = publishDeps({
    discoverProfiles: async () => [
      { agentDir: PLAY_AGENT_DIR, configPath: PLAY_CONFIG_PATH, name: "play" },
      { agentDir: AGENT_DIR, configPath: CONFIG_PATH, name: "work" },
      { agentDir: "/x", configPath: null, name: "empty" },
    ],
    profileSelector: {
      isInteractive: () => true,
      selectProfile: async (names) => {
        selected.push([...names]);
        return "play";
      },
    },
  });

  const { out, code } = await runCli(deps, ["publish"]);
  expect(code).toBeUndefined();
  expect(out).toContain("play");
  expect(selected).toEqual([["play", "work"]]);
});

test("maps selector cancellation before remote side effects", async () => {
  const remote = remoteCounters();
  const deps = publishDeps({
    discoverProfiles: async () => [
      { agentDir: PLAY_AGENT_DIR, configPath: PLAY_CONFIG_PATH, name: "play" },
      { agentDir: AGENT_DIR, configPath: CONFIG_PATH, name: "work" },
    ],
    httpFetch: remote.httpFetch,
    runner: remote.runner,
    profileSelector: {
      isInteractive: () => true,
      selectProfile: async () => null,
    },
  });

  const { out, code } = await runCli(deps, ["publish"]);
  expect(code).toBeGreaterThan(0);
  expect(out).toContain("selection_cancelled");
  expect(remote.calls).toEqual({ http: 0, runner: 0 });
});
```

Update the existing ambiguous test to inject `isInteractive: () => false` and assert `selectProfile` is not called. Add a `--json` variant with `isInteractive: () => true`; it must still return `ambiguous_profile` without calling `selectProfile`. Add a zero-publishable test where discovery returns only `configPath: null`, expecting `no_profile`.

- [ ] **Step 3: Write failing tests for explicit profile errors and side-effect isolation**

Add:

```ts
test("maps an invalid path-like input to invalid_profile", async () => {
  const remote = remoteCounters();
  let resolved = false;
  const deps = publishDeps({
    httpFetch: remote.httpFetch,
    resolveProfileConfig: async (profile) => {
      resolved = true;
      return {
        agentDir: AGENT_DIR,
        configPath: CONFIG_PATH,
        document: {},
        profile,
      };
    },
    runner: remote.runner,
  });

  const { out, code } = await runCli(deps, ["publish", "./work.yml"]);
  expect(code).toBeGreaterThan(0);
  expect(out).toContain("invalid_profile");
  expect(resolved).toBe(false);
  expect(remote.calls).toEqual({ http: 0, runner: 0 });
});

test("maps an absent named profile to profile_not_found", async () => {
  const remote = remoteCounters();
  const missingPath = "/omp/profiles/ghost/agent";
  const deps = publishDeps({
    httpFetch: remote.httpFetch,
    resolveProfileConfig: async () => {
      throw new OmpProfileNotFoundError("ghost", missingPath);
    },
    runner: remote.runner,
  });

  const { out, code } = await runCli(deps, ["publish", "ghost"]);
  expect(code).toBeGreaterThan(0);
  expect(out).toContain("profile_not_found");
  expect(remote.calls).toEqual({ http: 0, runner: 0 });
});

test("maps an existing profile without config to missing_config", async () => {
  const remote = remoteCounters();
  const deps = publishDeps({
    httpFetch: remote.httpFetch,
    resolveProfileConfig: async (profile) => ({
      agentDir: AGENT_DIR,
      configPath: null,
      document: null,
      profile,
    }),
    runner: remote.runner,
  });

  const { out, code } = await runCli(deps, ["publish", "work"]);
  expect(code).toBeGreaterThan(0);
  expect(out).toContain("missing_config");
  expect(remote.calls).toEqual({ http: 0, runner: 0 });
});
```

Also keep the existing sole-profile success test and assert profiles without configs do not prevent sole publishable auto-selection.

- [ ] **Step 4: Run publish tests and confirm the behavior matrix is red**

Run:

```bash
bun test apps/cli/src/commands/publish.test.ts
```

Expected: new interactive, cancellation, filtering, and stable-code assertions fail against the old implementation.

- [ ] **Step 5: Implement explicit profile validation and typed error translation**

Change the core import in `publish.ts`:

```ts
import {
  type DiscoveredProfile,
  OmpProfileNotFoundError,
  validateArtifact,
  validateProfileName,
} from "@oompf/core";
```

Before calling `resolveProfileConfig` for an explicit argument:

```ts
const validation = validateProfileName(c.args.profile);
if (!validation.ok) {
  throw new CommandError("invalid_profile", validation.reason);
}
try {
  const resolved = await deps.resolveProfileConfig(
    validation.value,
    ompOptions
  );
  name = resolved.profile;
  configPath = resolved.configPath;
} catch (error) {
  if (error instanceof OmpProfileNotFoundError) {
    throw new CommandError(
      "profile_not_found",
      `OMP profile "${validation.value}" was not found.`
    );
  }
  throw error;
}
```

Do not map OMP executable failures or malformed OMP output to `profile_not_found`.

- [ ] **Step 6: Implement publishable filtering and safe selection**

Replace omitted-input branching with:

```ts
function hasConfig(
  profile: DiscoveredProfile
): profile is DiscoveredProfile & { readonly configPath: string } {
  return profile.configPath !== null;
}

const discovered = await deps.discoverProfiles(ompOptions);
const publishable = discovered.filter(hasConfig);

if (publishable.length === 0) {
  throw new CommandError(
    "no_profile",
    "No publishable OMP profiles found. Create a profile with config.yml/config.yaml or pass an existing profile name."
  );
}

let selected = publishable[0]!;
if (publishable.length > 1) {
  const names = publishable.map((profile) => profile.name);
  if (c.formatExplicit || !deps.profileSelector.isInteractive()) {
    throw new CommandError(
      "ambiguous_profile",
      `Multiple publishable profiles found (${names.join(", ")}). Specify one: oompf publish <profile>.`
    );
  }
  const selectedName = await deps.profileSelector.selectProfile(names);
  if (selectedName === null) {
    throw new CommandError(
      "selection_cancelled",
      "Profile selection was cancelled. Nothing was published."
    );
  }
  selected = publishable.find((profile) => profile.name === selectedName)!;
}
name = selected.name;
configPath = selected.configPath;
```

Defend the selector seam rather than trusting arbitrary output: replace the non-null assertion with a checked lookup and throw a generic invariant error if a custom seam returns a name that was not offered. This is an internal operational error, not user input, and must still occur before side effects.

Update the positional description to:

```ts
.describe("Native OMP profile name; omitted selects a publishable profile")
```

- [ ] **Step 7: Run publish tests, all CLI tests, and CLI typecheck**

Run:

```bash
bun test apps/cli/src/commands/publish.test.ts
bun test apps/cli/src
bun run --filter=@grosspoetrysystems/oompf typecheck
```

Expected: all publish matrix tests, CLI tests, and typecheck pass.

- [ ] **Step 8: Commit the publish behavior**

```bash
git add apps/cli/src/commands/publish.ts apps/cli/src/commands/publish.test.ts
git commit -m "feat(cli): select native profiles for publish"
```

---

### Task 4: Command-owned publish documentation

**Files:**
- Modify: `apps/web/src/content/docs/cli-reference.md:24-36`
- Modify: `apps/web/src/content/docs/publishing-a-profile.md:8-37`
- Modify: `apps/web/src/content/docs/getting-started.md:49-56`

**Interfaces:**
- Consumes: the released CLI contract `oompf publish [profile]` and the six stable preflight codes.
- Produces: accurate command examples using native profile names, plus omitted-input selection and noninteractive behavior.
- Preserves: direct Gist install documentation and all non-publish guidance; GPS-86 remains the later broad consistency audit.

- [ ] **Step 1: Replace path examples with native profile names**

Use this executable example in all three files:

```bash
oompf publish work
```

Do not retain `./my-profile.yaml` as an alternative.

- [ ] **Step 2: Correct the CLI reference contract**

Set syntax to:

```md
- **Syntax:** `oompf publish [profile]`, where `profile` is a native OMP profile name.
```

Explain:

```md
When the name is omitted, OOMPF automatically uses the sole publishable profile.
With multiple profiles it opens a selector only in an interactive terminal;
`--json`, CI, and piped execution return `ambiguous_profile` instead of prompting.
```

List the preflight codes without implying arbitrary file input:

```md
- **Local failure modes:** `invalid_profile`, `profile_not_found`,
  `missing_config`, `no_profile`, `ambiguous_profile`, and
  `selection_cancelled`, plus structural validation and blocking-secret errors.
```

- [ ] **Step 3: Correct the publishing guide without adding GPS-82 behavior**

State that `work` is the native name used with `omp --profile work`. Add one short omitted-input paragraph matching the CLI reference. Replace the misleading repeat-publication statement with the current contract:

```md
- Each successful invocation creates a new public Gist. OOMPF does not remember
  a previous publication for the local profile.
```

Do not propose storage, Gist updates, or recovery behavior.

- [ ] **Step 4: Keep Getting Started concise**

After `oompf publish work`, say the argument is a native OMP profile name and may be omitted for automatic/interactive selection. Do not duplicate the full error matrix in the walkthrough.

- [ ] **Step 5: Run focused documentation checks**

Run:

```bash
bun run lint
bun run --filter=@oompf/web typecheck
bun run --filter=@oompf/web build
```

Expected: formatting/lint, web typecheck, and web build pass; generated docs contain no `oompf publish ./my-profile.yaml` examples.

- [ ] **Step 6: Commit only command-owned documentation**

```bash
git add apps/web/src/content/docs/cli-reference.md apps/web/src/content/docs/publishing-a-profile.md apps/web/src/content/docs/getting-started.md
git commit -m "docs: explain profile-first publishing"
```

---

### Task 5: End-to-end verification and cleanup

**Files:**
- Verify: all files changed in Tasks 1-4
- Modify only if verification exposes a real issue in the approved scope.

**Interfaces:**
- Consumes: the complete GPS-80/81 implementation.
- Produces: focused behavioral evidence, a real PTY cancellation smoke check, and the repository's full verification gate.

- [ ] **Step 1: Run focused behavioral verification**

Run:

```bash
bun test packages/core/src/omp-profile.test.ts
bun test apps/cli/src/profile-selector.test.ts apps/cli/src/commands/publish.test.ts
bun run --filter=@grosspoetrysystems/oompf typecheck
```

Expected: all focused tests pass and CLI typecheck exits zero.

- [ ] **Step 2: Smoke the real selector in a PTY and cancel it**

Start a PTY process through the harness process manager with application `bun` and the arguments `-e` plus this script:

```ts
import { createCli } from "./apps/cli/src/index.ts";

const calls = { http: 0, runner: 0 };
const config = "symbolPreset: default\n";
const deps = {
  discoverProfiles: async () => [
    {
      agentDir: "/profiles/play/agent",
      configPath: "/profiles/play/agent/config.yml",
      name: "play",
    },
    {
      agentDir: "/profiles/work/agent",
      configPath: "/profiles/work/agent/config.yml",
      name: "work",
    },
  ],
  fs: {
    exists: async () => true,
    mkdir: async () => {},
    readFile: async () => config,
    writeFile: async () => {},
  },
  httpFetch: async () => {
    calls.http += 1;
    throw new Error("Unexpected HTTP call");
  },
  runner: async () => {
    calls.runner += 1;
    throw new Error("Unexpected runner call");
  },
};
let exitCode = 0;
await createCli(deps).serve(["publish"], {
  exit: (code) => {
    exitCode = code;
  },
});
console.error(`side-effects runner=${calls.runner} http=${calls.http}`);
process.exitCode = exitCode;
```

Wait for both Clack choices (`play` and `work`), send `CTRL_C`, then wait for process exit. Verify output contains `selection_cancelled` and `side-effects runner=0 http=0`. This uses no real OMP profile, GitHub account, Gist, or OOMPF endpoint.

- [ ] **Step 3: Run the full repository gate**

Run:

```bash
bun run gate
```

Expected: lint, knip, all tests, all typechecks, all builds, migration/package checks, and local smoke pass.

- [ ] **Step 4: Perform required cleanup after the smoke passes**

Confirm command help and the three command-owned docs use `oompf publish [profile]`/`oompf publish work`; remove any obsolete path wording, unused helper, stale import, or test fixture introduced by this slice. Do not touch unrelated workspace changes or broaden the documentation audit.

- [ ] **Step 5: Re-run checks affected by cleanup**

Run the focused test or build corresponding to any cleanup edit. If cleanup changed executable code, rerun `bun run gate`; if it changed only Markdown wording, rerun `bun run lint` and the web build.

- [ ] **Step 6: Commit cleanup only when it changed tracked files**

Because earlier task commits leave these paths clean, staging the bounded task paths captures only cleanup edits:

```bash
git add packages/core/src/omp-profile.ts packages/core/src/omp-profile.test.ts packages/core/src/index.ts apps/cli/src/profile-selector.ts apps/cli/src/profile-selector.test.ts apps/cli/src/deps.ts apps/cli/package.json bun.lock apps/cli/src/commands/publish.ts apps/cli/src/commands/publish.test.ts apps/web/src/content/docs/cli-reference.md apps/web/src/content/docs/publishing-a-profile.md apps/web/src/content/docs/getting-started.md
git commit -m "chore: finish profile publish selection"
```

Skip this commit when no cleanup edits are needed.

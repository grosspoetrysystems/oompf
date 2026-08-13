# Profile-First Publish Selection

## Status

Approved design for GPS-80 and GPS-81. The `oompf publish` positional argument is exclusively a native OMP profile name. Omitting it may select a profile automatically or prompt in an interactive terminal. It never enables arbitrary filesystem-path publishing.

## Goals

- Make explicit publishing resolve one exact native OMP profile name.
- Preserve the existing automatic choice when exactly one publishable profile exists.
- Let interactive users choose among multiple publishable profiles when no name is supplied.
- Keep JSON, CI, and noninteractive execution deterministic and prompt-free.
- Reject every local preflight failure before GitHub authentication or remote mutation.
- Give callers stable error codes for invalid input, missing profiles, ambiguity, cancellation, and missing configuration.

## Non-goals

- Publish an arbitrary YAML path or browse the filesystem.
- Publish project overlays or any artifact beyond the selected profile's canonical config file.
- Remember a Gist identity or update a previous publication; that durable-state design belongs to GPS-82.
- Define multi-file profile bundles, bundle integrity, or portability trust tiers.
- Perform the cross-surface documentation audit tracked by GPS-86.
- Change direct Gist references supported by other commands.

## Command contract

The command syntax is:

```text
oompf publish [profile]
```

`profile`, when present, is a native OMP profile name governed by OMP's existing profile-name rules. OOMPF does not reinterpret invalid names as paths and does not fall back to reading a file.

### Behavior matrix

| Input and local state | Prompt | Result |
| --- | --- | --- |
| Explicit valid name; profile has `config.yml` or `config.yaml` | Never | Publish that exact profile. |
| Explicit invalid or path-like value | Never | Fail with `invalid_profile`. |
| Explicit valid name; profile does not exist | Never | Fail with `profile_not_found`. |
| Explicit valid name; profile exists without a supported config file | Never | Fail with `missing_config`. |
| Omitted name; no publishable profiles | Never | Fail with `no_profile`. |
| Omitted name; exactly one publishable profile | Never | Publish it automatically. |
| Omitted name; multiple publishable profiles; interactive human session | Yes | Show sorted native profile names and publish the selected profile. |
| Omitted name; multiple publishable profiles; JSON, CI, or noninteractive session | Never | Fail with `ambiguous_profile` and identify the candidate names. |
| Interactive selection is cancelled | Already displayed | Fail with `selection_cancelled`. |

A **publishable profile** is a discovered native OMP profile whose agent directory contains `config.yml` or `config.yaml`. Profiles without either file are excluded from omitted-input automatic selection and interactive choices. An explicitly named existing profile without either file still returns `missing_config`, because the user identified that profile directly.

## Selection and resolution flow

1. If a profile name is present, validate and resolve that exact native profile.
2. If the name is absent, discover profiles and discard entries without a supported config file.
3. Select the sole publishable entry automatically.
4. If multiple publishable entries remain, prompt only when the invocation is an interactive human session.
5. Treat JSON output, CI, or non-TTY input/output as noninteractive and return `ambiguous_profile` without opening a selector.
6. Pass only sorted native profile names to the selector. The selector does not accept free-form input or filesystem paths.
7. Resolve cancellation to `selection_cancelled` rather than continuing with an implicit choice.
8. Once selection succeeds, continue through the existing read, structural validation, secret scan, GitHub authentication, Gist creation, and OOMPF registration flow.

The CLI receives profile discovery and exact profile resolution from the existing dependency layer. Interactive selection uses a small injectable CLI dependency so command tests remain deterministic and never need a real terminal. This seam is limited to choosing from supplied profile names; it does not become a general wizard or file-picker abstraction.

## Interaction requirements

The selector:

- displays the profile name as the choice label;
- preserves discovery's deterministic name ordering;
- contains only profiles with a supported config file;
- returns one supplied profile name or a cancellation outcome;
- does not offer arbitrary text entry, path entry, profile creation, or overlay selection.

The command may prompt only when all of these conditions hold:

- the profile argument is omitted;
- more than one publishable profile exists;
- output mode is human-readable rather than JSON;
- the process is not running in CI;
- both input and output are attached to interactive terminals.

If any condition is false, the command returns `ambiguous_profile`. It must not read from stdin, render a prompt, or wait for user input.

## Stable errors

| Code | Meaning |
| --- | --- |
| `invalid_profile` | The explicit value is not a valid native OMP profile name, including path-like values. |
| `profile_not_found` | The explicit valid profile name does not resolve to an existing profile directory. |
| `missing_config` | The explicit existing profile lacks both supported config filenames. |
| `no_profile` | Omitted input yielded no publishable profiles. |
| `ambiguous_profile` | Omitted input yielded multiple publishable profiles but prompting was not permitted. |
| `selection_cancelled` | The user cancelled interactive selection. |

Errors from the OMP executable itself, unreadable files, invalid artifacts, blocking secrets, GitHub authentication, Gist creation, and registration keep their existing behavior unless a source-level distinction is required to produce the codes above.

`profile_not_found` must represent a missing resolved profile directory, not every failure from OMP path resolution. Invalid names map to `invalid_profile`; executable failures and malformed OMP output remain operational errors.

## Side-effect boundary

All local selection and preflight work completes before remote work. The required order is:

1. validate explicit input or discover and select an omitted input;
2. establish that the selected profile has a supported config file;
3. read and structurally validate the file;
4. run the blocking-secret scan;
5. authenticate with GitHub;
6. create the public Gist;
7. register the Gist with OOMPF.

Invalid input, a missing profile, a missing config, no candidates, noninteractive ambiguity, cancellation, unreadable or invalid YAML, and blocking secrets must not authenticate with GitHub, create a Gist, or call the OOMPF registration API.

## Test strategy

Command tests will cover:

- exact named-profile resolution;
- sole publishable-profile automatic selection;
- interactive selection among multiple publishable profiles;
- cancellation before side effects;
- multiple profiles under `--json` without invoking the selector;
- multiple profiles with noninteractive terminal state without invoking the selector;
- zero publishable profiles, including discovery results that all lack config files;
- unknown valid names mapped to `profile_not_found`;
- path-like input mapped to `invalid_profile`;
- an existing explicit profile without config mapped to `missing_config`;
- no GitHub runner or HTTP registration calls for every preflight failure.

Existing tests continue to cover artifact validation, secret refusal, GitHub authentication failure, successful Gist creation and registration, and registration errors.

Core-level tests should defend any new typed distinction used to separate an absent resolved profile directory from other resolution failures. Tests must assert behavior and error classification rather than matching the source text of implementation details.

## Documentation scope

GPS-81 corrects command-owned publish guidance that currently implies path input. Updated examples use native profile names such as:

```text
oompf publish work
```

The CLI syntax is documented as `oompf publish [profile]`, with omission behavior and noninteractive ambiguity explained. This slice does not rewrite unrelated install guidance, remove supported direct Gist references, or perform GPS-86's broader README, homepage, profile-page, and documentation consistency audit.

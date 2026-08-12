# Security policy

## Reporting a vulnerability

Report suspected vulnerabilities privately through [GitHub Security Advisories](https://github.com/grosspoetrysystems/oompf/security/advisories/new). Do not open a public issue for anything exploitable.

Include what you did, what happened, and what you expected. A reproduction against a scratch profile and a throwaway Gist is more useful than a description.

Expect an acknowledgement within a week. There is no bounty.

## What OOMPF is responsible for

OOMPF indexes configuration files that other people wrote and hands them to your machine. Three properties matter most, and a break in any of them is a security bug worth reporting:

**Published artifacts must not contain credentials.** `oompf publish` scans a profile before it leaves the machine. High-confidence findings — provider API key patterns, private key blocks, credential-like keys holding literal values — block publication outright. Lower-confidence findings warn. A profile that carries a real secret past that scan is a vulnerability.

**Findings and errors must not leak the values they describe.** Secret findings carry a key path, a category, and a value-free reason. YAML parse errors are configured without source frames for the same reason. Any output that echoes a secret value is a vulnerability, including logs and API error envelopes.

**Installing must not overwrite.** `oompf add` writes a new profile directory or fails. There is no `--force`, and a name collision is an error that touches nothing. Any path where installing mutates an existing local profile is a vulnerability.

Also in scope: anything letting an indexed profile execute code during publish, index, or install; server-side injection through profile content; and the index serving artifact content it should never have stored.

## What OOMPF is not responsible for

**The contents of a published profile.** A profile is configuration for an agent that runs commands on your machine. It can specify hooks, extensions, and project overlays. OOMPF validates structure and scans for secrets — it does not audit intent, and it cannot tell a useful hook from a hostile one. `oompf inspect` exists so you can read what a profile does before installing it. Doing so is your responsibility.

**OMP itself.** OOMPF describes the profile format and installs files. Runtime behaviour belongs to [OMP](https://github.com/can1357/oh-my-pi); report runtime vulnerabilities there.

**The canonical source.** Profiles live in public GitHub Gists. Availability, authorship, and account security are GitHub's domain. OOMPF records the source URL, revision, and a SHA-256 of the exact bytes it indexed so you can verify what you received.

## Supported versions

Only the latest published release of the `oompf` CLI, and the currently deployed index at `oompf.run`. There are no long-term support branches.

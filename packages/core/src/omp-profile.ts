/**
 * Portable OMP profile discovery and path resolution.
 *
 * OOMPF never hardcodes `~/.omp`. Instead it treats the OMP CLI as the single
 * source of truth for where a profile's agent directory lives, invoking
 * `omp --profile <name> config path` (and the profile-less `omp config path`)
 * with the current environment propagated. This honours `PI_CONFIG_DIR`,
 * `PI_CODING_AGENT_DIR`, XDG base directories, and OMP's own profile
 * resolution without OOMPF having to re-implement any of it.
 *
 * OMP is always invoked as an argv array (never a shell string), so profile
 * names — even hostile ones — are passed as opaque arguments with no shell
 * interpolation.
 */

import { readdir, readFile, stat } from "node:fs/promises";
import { dirname, isAbsolute, join } from "node:path";
import { env } from "node:process";

import { validateProfileName } from "./profile-name.ts";
import { spawnCapture } from "./spawn.ts";
import { assertProfileDocument, parseProfileYaml } from "./yaml-config.ts";

/** A profile found on disk under OMP's resolved profiles directory. */
export interface DiscoveredProfile {
  /** Absolute path to the profile's agent directory. */
  readonly agentDir: string;
  /** Absolute path to `config.yml`/`config.yaml`, or `null` if neither exists. */
  readonly configPath: string | null;
  /** The profile name (directory basename), already OMP-valid. */
  readonly name: string;
}

/** The fully resolved configuration for a single existing profile. */
export interface ResolvedProfileConfig {
  /** Absolute path to the profile's agent directory (verified to exist). */
  readonly agentDir: string;
  /** Absolute path to the loaded config file, or `null` when none is present. */
  readonly configPath: string | null;
  /** Parsed config document (mapping root), or `null` when no config exists. */
  readonly document: Record<string, unknown> | null;
  /** The profile name that was resolved. */
  readonly profile: string;
}

/** Options accepted by every resolver; `ompCommand` overrides the binary. */
export interface OmpProfileOptions {
  /** Executable used to invoke OMP. Defaults to `"omp"` on `PATH`. */
  readonly ompCommand?: string;
}

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

const DEFAULT_OMP_COMMAND = "omp";

/**
 * Config filenames OOMPF understands, in preference order: `config.yml` wins
 * over `config.yaml` when both are present.
 */
const CONFIG_FILENAMES = ["config.yml", "config.yaml"] as const;

// Process spawning lives in one place for the whole workspace; see spawn.ts for
// why it is `node:child_process` rather than the Bun global.

type PathKind = "directory" | "file" | "other" | "missing";

async function statKind(target: string): Promise<PathKind> {
  try {
    const info = await stat(target);
    if (info.isDirectory()) {
      return "directory";
    }
    if (info.isFile()) {
      return "file";
    }
    return "other";
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      return "missing";
    }
    throw error;
  }
}

/**
 * Invoke `omp [--profile <name>] config path`, returning the trimmed agent
 * directory it reports.
 *
 * @param profile - profile name, or `null` for the default (profile-less) path.
 * @param ompCommand - OMP executable to spawn.
 * @param requireDirectory - when true, the resolved path MUST already exist as
 *   a directory (used when reading an existing profile); when false the path is
 *   accepted as a not-yet-created install target.
 */
async function resolveConfigPath(
  profile: string | null,
  ompCommand: string,
  requireDirectory: boolean
): Promise<string> {
  const cmd = [ompCommand];
  if (profile !== null) {
    cmd.push("--profile", profile);
  }
  cmd.push("config", "path");

  const { exitCode, stderr, stdout } = await spawnCapture({
    args: cmd.slice(1),
    command: ompCommand,
    env,
  });

  const label = profile === null ? "default profile" : `profile "${profile}"`;
  if (exitCode !== 0) {
    const detail = stderr.trim() || `exit code ${exitCode}`;
    throw new Error(
      `OMP failed to resolve the ${label} config path: ${detail}`
    );
  }

  const resolved = stdout.trim();
  if (resolved.length === 0) {
    throw new Error(`OMP returned an empty config path for the ${label}.`);
  }
  if (!isAbsolute(resolved)) {
    throw new Error(
      `OMP returned a non-absolute config path for the ${label}: "${resolved}".`
    );
  }
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
  return resolved;
}

async function findConfigFile(agentDir: string): Promise<string | null> {
  for (const filename of CONFIG_FILENAMES) {
    const candidate = join(agentDir, filename);
    if ((await statKind(candidate)) === "file") {
      return candidate;
    }
  }
  return null;
}

async function loadConfigDocument(
  configPath: string | null
): Promise<Record<string, unknown> | null> {
  if (configPath === null) {
    return null;
  }
  const text = await readFile(configPath, "utf8");
  return assertProfileDocument(parseProfileYaml(text));
}

/**
 * Resolve the agent directory OMP would use to install a profile named `name`.
 *
 * Validates the name first, then asks OMP for the path. Succeeds for a profile
 * that does not yet exist — the returned directory is an install target, so it
 * is not required to be present on disk.
 */
export async function resolveInstallTarget(
  name: string,
  options?: OmpProfileOptions
): Promise<string> {
  const validation = validateProfileName(name);
  if (!validation.ok) {
    throw new Error(validation.reason);
  }
  return resolveConfigPath(
    validation.value,
    options?.ompCommand ?? DEFAULT_OMP_COMMAND,
    false
  );
}

/**
 * Resolve the full configuration for an existing profile.
 *
 * Validates the name, resolves the agent directory via OMP (which MUST exist),
 * then loads `config.yml`/`config.yaml` if present. Rejects when the profile's
 * agent directory is missing.
 */
export async function resolveProfileConfig(
  profile: string,
  options?: OmpProfileOptions
): Promise<ResolvedProfileConfig> {
  const validation = validateProfileName(profile);
  if (!validation.ok) {
    throw new Error(validation.reason);
  }

  const agentDir = await resolveConfigPath(
    validation.value,
    options?.ompCommand ?? DEFAULT_OMP_COMMAND,
    true
  );
  const configPath = await findConfigFile(agentDir);
  const document = await loadConfigDocument(configPath);
  return { agentDir, configPath, document, profile: validation.value };
}

/**
 * Discover every profile present under OMP's resolved profiles directory.
 *
 * The profiles root is derived from OMP's own default agent path (`omp config
 * path`), so it follows whatever `PI_CONFIG_DIR`/XDG/etc. resolution OMP
 * applies. Directory entries whose names are not OMP-valid, and profiles whose
 * agent directory is absent, are skipped. Results are sorted by name.
 */
export async function discoverProfiles(
  options?: OmpProfileOptions
): Promise<DiscoveredProfile[]> {
  const ompCommand = options?.ompCommand ?? DEFAULT_OMP_COMMAND;
  const defaultAgentDir = await resolveConfigPath(null, ompCommand, false);
  const profilesRoot = join(dirname(defaultAgentDir), "profiles");

  let entries;
  try {
    entries = await readdir(profilesRoot, { withFileTypes: true });
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      return [];
    }
    throw error;
  }

  const discovered: DiscoveredProfile[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }
    if (!validateProfileName(entry.name).ok) {
      continue;
    }
    const agentDir = join(profilesRoot, entry.name, "agent");
    if ((await statKind(agentDir)) !== "directory") {
      continue;
    }
    discovered.push({
      agentDir,
      configPath: await findConfigFile(agentDir),
      name: entry.name,
    });
  }
  discovered.sort((left, right) => left.name.localeCompare(right.name));
  return discovered;
}

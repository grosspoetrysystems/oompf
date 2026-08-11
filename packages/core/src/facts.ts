/**
 * Metadata extraction from native OMP profile YAML.
 *
 * `extractFacts` reads the *native* OMP configuration document and surfaces only
 * the facts that are reliably present in the artifact. It is enrichment, not a
 * second execution schema: OOMPF never reinterprets OMP fields into a
 * generalized agent-role system, and unknown keys are preserved (reported via
 * {@link ProfileFacts.unknownKeys}) rather than dropped or transformed.
 *
 * Observed native fields (see docs/research.md) include `symbolPreset`,
 * `theme`, `setupVersion`, `defaultThinkingLevel`, `disabledProviders`,
 * `enabledModels`, `modelRoles`, `retry.fallbackChains`, `advisor`, `memory`,
 * `mnemopi`, and `inspect_image`.
 */

import { isRecord } from "./guards.ts";

/** A role-to-model assignment from `modelRoles`. */
export interface ModelRole {
  readonly model: string;
  readonly role: string;
}

/** An ordered fallback list, keyed by its role/chain name. */
export interface FallbackChain {
  readonly models: readonly string[];
  readonly role: string;
}

/** Advisor settings observed in `advisor`. */
export interface AdvisorFacts {
  readonly enabled?: boolean;
  readonly subagents?: unknown;
  readonly syncBacklog?: boolean;
}

/**
 * An external requirement the artifact evidences but cannot itself satisfy: it
 * must be provided by the local runtime (credentials, environment variables,
 * project overlays, or installed extensions). Names are safe to display — this
 * never carries a secret value.
 */
export interface Prerequisite {
  readonly kind: "provider" | "environment" | "project-overlay" | "extension";
  readonly name: string;
  readonly reason: string;
}

/** Reliable, source-derived facts about a native OMP profile artifact. */
export interface ProfileFacts {
  readonly advisor: AdvisorFacts | null;
  /**
   * Named model aliases referenced by the profile (selectors beginning with
   * `@`). Aliases are indirections resolved by the local runtime, so they are
   * deliberately excluded from {@link models} and {@link providers}.
   */
  readonly aliases: readonly string[];
  readonly context: unknown;
  readonly disabledProviders: readonly string[];
  readonly extensions: readonly string[];
  readonly fallbackChains: readonly FallbackChain[];
  /** Recognized scalar identity fields present in the document. */
  readonly fields: Readonly<Record<string, unknown>>;
  readonly hooks: readonly string[];
  readonly inspection: unknown;
  readonly memory: unknown;
  readonly modelRoles: readonly ModelRole[];
  /** Every distinct model identifier referenced anywhere in the artifact. */
  readonly models: readonly string[];
  readonly prerequisites: readonly Prerequisite[];
  /** Providers inferred from `<provider>/<model>` identifiers. */
  readonly providers: readonly string[];
  /** Top-level keys OOMPF does not recognize, preserved for forward compat. */
  readonly unknownKeys: readonly string[];
}

/** Top-level keys `extractFacts` recognizes; the rest surface as unknown. */
const RECOGNIZED_KEYS: Record<string, true> = {
  advisor: true,
  context: true,
  defaultThinkingLevel: true,
  disabledProviders: true,
  enabledModels: true,
  extensions: true,
  hooks: true,
  inspect_image: true,
  memory: true,
  mnemopi: true,
  modelRoles: true,
  oompf: true,
  overlays: true,
  projectOverlays: true,
  retry: true,
  setupVersion: true,
  symbolPreset: true,
  theme: true,
};

/** Scalar identity fields lifted verbatim into {@link ProfileFacts.fields}. */
const SCALAR_FIELDS = [
  "symbolPreset",
  "theme",
  "setupVersion",
  "defaultThinkingLevel",
] as const;

/** Matches `${VAR}` / `$VAR` environment references in string values. */
const ENV_REFERENCE = /\$\{?([A-Za-z_][A-Za-z0-9_]*)\}?/g;

/** Return the string members of `value` when it is an array of strings. */
function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === "string");
}

/** Infer the provider from a `<provider>/<model>` identifier, if any. */
function providerOf(model: string): string | null {
  const slash = model.indexOf("/");
  if (slash <= 0) {
    return null;
  }
  return model.slice(0, slash);
}

/** Extract a displayable name from a hook/extension entry. */
function entryName(entry: unknown): string | null {
  if (typeof entry === "string") {
    return entry;
  }
  if (isRecord(entry)) {
    for (const key of ["name", "id", "path", "module"]) {
      const value = entry[key];
      if (typeof value === "string") {
        return value;
      }
    }
  }
  return null;
}

/** Collect names from a hooks/extensions field (list, object-list, or map). */
function collectNames(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map(entryName).filter((n): n is string => n !== null);
  }
  if (isRecord(value)) {
    return Object.keys(value);
  }
  if (typeof value === "string") {
    return [value];
  }
  return [];
}

/** Build a record of the present keys, or `null` when none are present. */
function pickPresent(
  document: Record<string, unknown>,
  keys: readonly string[]
): Record<string, unknown> | null {
  const picked: Record<string, unknown> = {};
  let found = false;
  for (const key of keys) {
    if (key in document) {
      picked[key] = document[key];
      found = true;
    }
  }
  return found ? picked : null;
}

/** Push `value` into `list` only if it is not already present. */
function pushUnique(list: string[], value: string): void {
  if (!list.includes(value)) {
    list.push(value);
  }
}

/**
 * Record a model selector as either a concrete model or a named alias. Alias
 * selectors (leading `@`) are runtime indirections, not runnable models, so
 * they are collected separately and kept out of the concrete model/provider
 * facts.
 */
function recordModel(
  selector: string,
  models: string[],
  aliases: string[]
): void {
  if (selector.startsWith("@")) {
    pushUnique(aliases, selector);
  } else {
    pushUnique(models, selector);
  }
}

/** Recursively collect environment-variable names from every string value. */
function collectEnvRefs(node: unknown, into: string[]): void {
  if (typeof node === "string") {
    for (const match of node.matchAll(ENV_REFERENCE)) {
      const name = match[1];
      if (name) {
        pushUnique(into, name);
      }
    }
    return;
  }
  if (Array.isArray(node)) {
    for (const item of node) {
      collectEnvRefs(item, into);
    }
    return;
  }
  if (isRecord(node)) {
    for (const value of Object.values(node)) {
      collectEnvRefs(value, into);
    }
  }
}

/** Extract `modelRoles` mappings, splitting single models from fallback lists. */
function extractModelRoles(
  value: unknown,
  models: string[],
  aliases: string[],
  fallbackChains: FallbackChain[]
): ModelRole[] {
  if (!isRecord(value)) {
    return [];
  }
  const roles: ModelRole[] = [];
  for (const [role, assigned] of Object.entries(value)) {
    if (typeof assigned === "string") {
      roles.push({ model: assigned, role });
      recordModel(assigned, models, aliases);
    } else if (Array.isArray(assigned)) {
      const chain = stringArray(assigned);
      if (chain.length > 0) {
        fallbackChains.push({ models: chain, role });
        for (const model of chain) {
          recordModel(model, models, aliases);
        }
      }
    }
  }
  return roles;
}

/** Extract `retry.fallbackChains` (map of lists or list of lists). */
function extractFallbackChains(
  value: unknown,
  models: string[],
  aliases: string[]
): FallbackChain[] {
  const chains: FallbackChain[] = [];
  const add = (role: string, raw: unknown): void => {
    const chain = stringArray(raw);
    if (chain.length === 0) {
      return;
    }
    chains.push({ models: chain, role });
    for (const model of chain) {
      recordModel(model, models, aliases);
    }
  };
  if (isRecord(value)) {
    for (const [role, raw] of Object.entries(value)) {
      add(role, raw);
    }
  } else if (Array.isArray(value)) {
    if (value.every((item) => typeof item === "string")) {
      add("default", value);
    } else {
      value.forEach((raw, index) => add(`chain[${index}]`, raw));
    }
  }
  return chains;
}

/** Extract observed advisor settings, or `null` when `advisor` is absent. */
function extractAdvisor(value: unknown): AdvisorFacts | null {
  if (!isRecord(value)) {
    return null;
  }
  const advisor: {
    enabled?: boolean;
    subagents?: unknown;
    syncBacklog?: boolean;
  } = {};
  if (typeof value.enabled === "boolean") {
    advisor.enabled = value.enabled;
  }
  if ("subagents" in value) {
    advisor.subagents = value.subagents;
  }
  if (typeof value.syncBacklog === "boolean") {
    advisor.syncBacklog = value.syncBacklog;
  }
  return advisor;
}

/**
 * Extract reliable facts from a parsed native OMP profile document.
 *
 * The input document is never mutated and unknown keys are preserved and
 * reported. Providers, environment references, and configured extensions become
 * explicit runtime {@link Prerequisite}s so consumers can state what the
 * artifact cannot itself satisfy.
 */
export function extractFacts(document: Record<string, unknown>): ProfileFacts {
  const fields: Record<string, unknown> = {};
  for (const key of SCALAR_FIELDS) {
    if (key in document) {
      fields[key] = document[key];
    }
  }

  const models: string[] = [];
  const aliases: string[] = [];
  const fallbackChains: FallbackChain[] = [];

  const modelRoles = extractModelRoles(
    document.modelRoles,
    models,
    aliases,
    fallbackChains
  );

  for (const model of stringArray(document.enabledModels)) {
    recordModel(model, models, aliases);
  }

  if (isRecord(document.retry)) {
    for (const chain of extractFallbackChains(
      document.retry.fallbackChains,
      models,
      aliases
    )) {
      fallbackChains.push(chain);
    }
  }

  const providers: string[] = [];
  for (const model of models) {
    const provider = providerOf(model);
    if (provider) {
      pushUnique(providers, provider);
    }
  }

  const disabledProviders = stringArray(document.disabledProviders);
  const advisor = extractAdvisor(document.advisor);
  const hooks = collectNames(document.hooks);
  const extensions = collectNames(document.extensions);

  const envRefs: string[] = [];
  collectEnvRefs(document, envRefs);

  const overlays = [
    ...stringArray(document.projectOverlays),
    ...stringArray(document.overlays),
  ];

  // Deduplicate by (kind, name): providers are already unique, but a name may
  // legitimately appear in more than one source (e.g. as both a hook and an
  // extension), and each prerequisite should be stated exactly once.
  const prerequisites: Prerequisite[] = [];
  const seenPrereqs: Record<string, true> = {};
  const addPrereq = (prereq: Prerequisite): void => {
    const key = `${prereq.kind}:${prereq.name}`;
    if (Object.hasOwn(seenPrereqs, key)) {
      return;
    }
    seenPrereqs[key] = true;
    prerequisites.push(prereq);
  };
  for (const provider of providers) {
    addPrereq({
      kind: "provider",
      name: provider,
      reason: `Provider "${provider}" requires credentials or configuration in the local runtime.`,
    });
  }
  for (const name of envRefs) {
    addPrereq({
      kind: "environment",
      name,
      reason: `Environment variable "${name}" must be set in the local runtime.`,
    });
  }
  for (const name of [...hooks, ...extensions]) {
    addPrereq({
      kind: "extension",
      name,
      reason: `Extension "${name}" must be installed in the local runtime.`,
    });
  }
  for (const name of overlays) {
    addPrereq({
      kind: "project-overlay",
      name,
      reason: `Project overlay "${name}" applies only in the local project.`,
    });
  }

  const unknownKeys = Object.keys(document).filter(
    (key) => !Object.hasOwn(RECOGNIZED_KEYS, key)
  );

  return {
    advisor,
    aliases,
    context: document.context ?? null,
    disabledProviders,
    extensions,
    fallbackChains,
    fields,
    hooks,
    inspection: pickPresent(document, ["inspect_image"]),
    memory: pickPresent(document, ["memory", "mnemopi"]),
    modelRoles,
    models,
    prerequisites,
    providers,
    unknownKeys,
  };
}

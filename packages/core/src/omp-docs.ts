/**
 * Curated OMP documentation registry.
 *
 * Every outbound URL that points at OMP's own documentation lives in this one
 * module, so the links are enumerable, reviewable, and testable rather than
 * sprinkled through templates — the same contract `provider-links.ts` gives the
 * provider/model display registry.
 *
 * Links are curated rather than guessed. Runtime consumers resolve targets
 * here; static Markdown mirrors these curated targets.
 *
 * OMP's docs are the repository's `docs/` markdown — `https://omp.sh/` is the
 * project home and does not publish per-topic pages, so the durable targets are
 * blob URLs into those files.
 */

/** OMP project home. */
export const OMP_SITE = "https://omp.sh/";

/** OMP source repository root. */
export const OMP_REPO = "https://github.com/can1357/oh-my-pi";

/** The OMP documentation tree (the `docs/` directory on `main`). */
export const OMP_DOCS_TREE = `${OMP_REPO}/tree/main/docs`;

/** Root of OMP's documentation pages on `main`. */
const OMP_DOC_BASE = `${OMP_REPO}/blob/main/docs`;

/** One cataloged target in OMP's documentation. */
export interface OmpDocLink {
  /** Absolute URL into OMP's docs, optionally anchored where the topic lives. */
  readonly href: string;
  /** Stable human-readable label, e.g. "Profile layout". */
  readonly label: string;
}

/** A documentation or catalog key the registry can resolve. */
type OmpDocKey = keyof typeof OMP_DOC_KEY_MAP;

const doc = (page: string, anchor: string, label: string): OmpDocLink => ({
  href: `${OMP_DOC_BASE}/${page}.md#${anchor}`,
  label,
});

/**
 * One mapping supplies both concept lookup and the enumerable catalog. The
 * catalog-only keys cover targets used by static surfaces that have no
 * corresponding OOMPF concept.
 */
const OMP_DOC_KEY_MAP = {
  advisor: doc(
    "advisor-watchdog",
    "advisor-watchdogmd-and-watchdogyml",
    "Advisor"
  ),
  agents: doc(
    "task-agent-discovery",
    "task-agent-discovery-and-selection",
    "Agents"
  ),
  configPrecedence: doc(
    "config-usage",
    "8-precedence-rules-to-rely-on",
    "Config precedence"
  ),
  configUsage: doc(
    "config-usage",
    "configuration-discovery-and-resolution",
    "Configuration usage"
  ),
  context: doc("context-files", "context-files", "Context files"),
  disabledProviders: doc(
    "settings",
    "provider-and-source-disabling",
    "Disabling providers"
  ),
  environmentVariables: doc(
    "environment-variables",
    "environment-variables-current-runtime-reference",
    "Environment variables"
  ),
  extensions: doc("extensions", "extensions", "Extensions"),
  fallbackChains: doc("settings", "retry-and-fallback", "Fallback chains"),
  hooks: doc("hooks", "hooks", "Hooks"),
  mcp: doc("mcp-config", "mcp-configuration-in-omp", "MCP"),
  memory: doc("memory", "autonomous-memory", "Memory"),
  modelRoles: doc(
    "models",
    "model-and-provider-configuration-modelsyml--modelsyaml",
    "Model roles"
  ),
  models: doc(
    "models",
    "model-and-provider-configuration-modelsyml--modelsyaml",
    "Models"
  ),
  precedence: doc("settings", "precedence", "Settings precedence"),
  profiles: doc("config-usage", "profiles", "Profile layout"),
  providerCredentials: doc(
    "providers",
    "credentials-and-precedence",
    "Provider credentials"
  ),
  providerOverview: doc("providers", "providers", "Providers"),
  providers: doc("providers", "credentials-and-precedence", "Providers"),
  settings: doc("settings", "settings-catalog", "Settings"),
} as const;

/**
 * Every curated OMP documentation link, for surfaces that render the whole
 * set.
 */
export const OMP_DOCS: readonly OmpDocLink[] = Object.values(OMP_DOC_KEY_MAP);

/**
 * Resolve an OOMPF concept or catalog key to its upstream OMP documentation
 * target. Returns `null` for keys with no known page rather than guessing a
 * URL — the same contract as the provider registry, and for the same reason.
 */
export function ompDocLink(key: string): OmpDocLink | null {
  return Object.hasOwn(OMP_DOC_KEY_MAP, key)
    ? OMP_DOC_KEY_MAP[key as OmpDocKey]
    : null;
}

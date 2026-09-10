/**
 * Curated OMP documentation registry.
 *
 * Every outbound URL that points at OMP's own documentation lives in this one
 * module, so the links are enumerable, reviewable, and testable rather than
 * sprinkled through templates — the same contract `provider-links.ts` gives the
 * provider/model display registry.
 *
 * Links are curated, never guessed: an entry exists only when its target was
 * verified against the upstream repository. Every anchor was checked 2026-09-10
 * against `can1357/oh-my-pi` `main`: the heading exists in the doc source and
 * the fragment is what GitHub's anchor generation (github-slugger) produces for
 * it. The docs track `main`, so a heading can move; the registry is the single
 * place to fix that when it does.
 *
 * OMP's docs are the repository's `docs/` markdown — `https://omp.sh/` is the
 * project home and does not publish per-topic pages, so the durable targets are
 * blob URLs with anchors into those files.
 */

/** OMP project home. */
export const OMP_SITE = "https://omp.sh/";

/** OMP source repository root. */
export const OMP_REPO = "https://github.com/can1357/oh-my-pi";

/** The OMP documentation tree (the `docs/` directory on `main`). */
export const OMP_DOCS_TREE = `${OMP_REPO}/tree/main/docs`;

/** Root of the verified OMP documentation pages on `main`. */
const OMP_DOC_BASE = `${OMP_REPO}/blob/main/docs`;

/** One verified target in OMP's documentation. */
export interface OmpDocLink {
  /** Absolute URL into OMP's docs, anchored where the topic lives. */
  readonly href: string;
  /** Stable human-readable label, e.g. "Profile layout". */
  readonly label: string;
}

/** A documentation page key the registry can resolve, for narrow typing. */
type OmpDocKey =
  | "advisor"
  | "agents"
  | "context"
  | "disabledProviders"
  | "extensions"
  | "fallbackChains"
  | "hooks"
  | "mcp"
  | "memory"
  | "models"
  | "modelRoles"
  | "precedence"
  | "profiles"
  | "providers"
  | "settings";

const doc = (page: string, anchor: string, label: string): OmpDocLink => ({
  href: `${OMP_DOC_BASE}/${page}#${anchor}`,
  label,
});

/**
 * Every curated OMP documentation link, for surfaces that surface the whole
 * set (the site footer, README, CLI help).
 */
export const OMP_DOCS: readonly OmpDocLink[] = [
  doc("config-usage", "profiles", "Profile layout"),
  doc("config-usage", "8-precedence-rules-to-rely-on", "Config precedence"),
  doc("settings", "settings-catalog", "Settings"),
  doc("settings", "precedence", "Settings precedence"),
  doc("settings", "retry-and-fallback", "Fallbacks"),
  doc("settings", "provider-and-source-disabling", "Disabling providers"),
  doc(
    "models",
    "model-and-provider-configuration-modelsyml-modelsyaml",
    "Models"
  ),
  doc("providers", "providers", "Providers"),
  doc("providers", "credentials-and-precedence", "Provider credentials"),
  doc("advisor-watchdog", "advisor-watchdogmd-and-watchdogyml", "Advisor"),
  doc("memory", "autonomous-memory", "Memory"),
  doc("hooks", "hooks", "Hooks"),
  doc("extensions", "extensions", "Extensions"),
  doc("context-files", "context-files", "Context files"),
  doc("task-agent-discovery", "task-agent-discovery-and-selection", "Agents"),
  doc("mcp-config", "mcp-configuration-in-omp", "MCP"),
];

/**
 * Resolve an OOMPF concept or config key to its upstream OMP documentation
 * target. Returns `null` for keys with no known page rather than guessing a
 * URL — the same contract as the provider registry, and for the same reason.
 */
export function ompDocLink(key: string): OmpDocLink | null {
  return key in OMP_DOC_KEY_MAP ? OMP_DOC_KEY_MAP[key as OmpDocKey] : null;
}

/** Concept/config key → documentation link. Every key shares one of the above. */
const OMP_DOC_KEY_MAP: Readonly<Record<OmpDocKey, OmpDocLink>> = {
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
  context: doc("context-files", "context-files", "Context files"),
  disabledProviders: doc(
    "settings",
    "provider-and-source-disabling",
    "Disabling providers"
  ),
  extensions: doc("extensions", "extensions", "Extensions"),
  fallbackChains: doc("settings", "retry-and-fallback", "Fallback chains"),
  hooks: doc("hooks", "hooks", "Hooks"),
  mcp: doc("mcp-config", "mcp-configuration-in-omp", "MCP"),
  memory: doc("memory", "autonomous-memory", "Memory"),
  modelRoles: doc(
    "models",
    "model-and-provider-configuration-modelsyml-modelsyaml",
    "Model roles"
  ),
  models: doc(
    "models",
    "model-and-provider-configuration-modelsyml-modelsyaml",
    "Models"
  ),
  precedence: doc("settings", "precedence", "Settings precedence"),
  profiles: doc("config-usage", "profiles", "Profile layout"),
  providers: doc("providers", "credentials-and-precedence", "Providers"),
  settings: doc("settings", "settings-catalog", "Settings"),
};

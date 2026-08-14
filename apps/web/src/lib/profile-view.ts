/**
 * Presentation model for the human-facing profile page (`/p/<id>`).
 *
 * This is the single place that turns a persisted {@link ProfileRecord} into the
 * exact, ordered facts the page renders: an author summary, friendly-first model
 * display, linked providers, OMP aliases kept separate from concrete models,
 * behavior settings, actionable non-provider requirements, and explained
 * provenance. The primary install reference is always the canonical OOMPF URL —
 * never the raw Gist URL.
 *
 * Model/provider display is resolved through injected `@oompf/core` resolvers so
 * this module never duplicates the curated mapping registry; the page supplies
 * the real ones and tests can supply deterministic stubs. Curated metadata and
 * alias facts are read defensively so records indexed before the metadata schema
 * landed still render cleanly.
 */

import {
  type ModelDisplay,
  type ModelThinkingLevel,
  type Prerequisite,
  type ProfileMetadata,
  type ProviderLink,
  parseModelSelectorDisplay,
} from "@oompf/core";
import type { ProfileRecord } from "@oompf/database";

/** The canonical public origin used when no site origin is configured. */
const CANONICAL_ORIGIN = "https://oompf.run";

/** Injected dependencies; resolvers are required so callers stay explicit. */
export interface ProfileViewDeps {
  /** Friendly model display resolver, from `@oompf/core`. */
  readonly resolveModel: (model: string) => ModelDisplay;
  /** Provider link resolver, from `@oompf/core`. */
  readonly resolveProvider: (provider: string) => ProviderLink;
  /** Canonical site origin (e.g. `Astro.site?.origin`); falsy → {@link CANONICAL_ORIGIN}. */
  readonly siteOrigin?: string | null;
}

/** A model selector shaped once for compact Models and Behavior rendering. */
interface ModelReferenceView extends ModelDisplay {
  /** The exact selector from the published profile, including any effort suffix. */
  readonly selector: string;
  readonly thinkingLevel: ModelThinkingLevel | null;
}

/** A curated, publisher-authored link with a guaranteed display label. */
interface CuratedLinkView {
  readonly label: string;
  readonly url: string;
}

/** The profile kind chip: a value plus whether it is a controlled/standard kind. */
interface KindView {
  readonly controlled: boolean;
  readonly value: string;
}

/** An actionable, non-provider requirement rendered under Requirements. */
interface RequirementView {
  readonly kind: Prerequisite["kind"];
  readonly kindLabel: string;
  readonly name: string;
  readonly reason: string;
}

/** A single labeled behavior setting (advisor entry or scalar OMP field). */
interface BehaviorSetting {
  readonly label: string;
  readonly value: string;
}

/** Consolidated runtime behavior facts. */
interface BehaviorView {
  readonly advisor: readonly BehaviorSetting[];
  readonly disabledProviders: readonly string[];
  readonly extensions: readonly string[];
  readonly fallbackChains: readonly {
    readonly models: readonly ModelReferenceView[];
    readonly role: string;
  }[];
  readonly hooks: readonly string[];
  readonly modelRoles: readonly {
    readonly model: ModelReferenceView;
    readonly role: string;
  }[];
  /** True when any behavior fact is present; drives section rendering. */
  readonly present: boolean;
  readonly settings: readonly BehaviorSetting[];
}

/** Explained source and integrity provenance. */
interface ProvenanceView {
  readonly contentHash: string;
  readonly indexedAt: string | null;
  readonly indexedLabel: string | null;
  readonly owner: string | null;
  readonly revision: string | null;
  /** GitHub Gist revision URL when a revision is pinned, else `null`. */
  readonly revisionUrl: string | null;
  readonly sourceUrl: string;
}

/** The fully shaped, render-ready profile view. */
export interface ProfileView {
  readonly behavior: BehaviorView;
  /** `oompf add https://oompf.run/p/<id>` — always the canonical OOMPF URL. */
  readonly installCommand: string;
  readonly kind: KindView | null;
  readonly links: readonly CuratedLinkView[];
  readonly models: readonly ModelReferenceView[];
  readonly ompVersion: string | null;
  readonly owner: string | null;
  readonly profileName: string;
  readonly profileUrl: string;
  readonly provenance: ProvenanceView;
  readonly providers: readonly ProviderLink[];
  readonly requirements: readonly RequirementView[];
  readonly structuralValid: boolean;
  readonly summary: string | null;
  readonly tags: readonly string[];
  readonly warnings: readonly string[];
}

/** Friendly labels for the non-provider prerequisite kinds. */
const REQUIREMENT_LABELS: Record<string, string> = {
  environment: "Environment variable",
  extension: "Extension",
  "project-overlay": "Project overlay",
};

/** Friendly labels for the scalar OMP settings surfaced under Behavior. */
const SETTING_LABELS: Record<string, string> = {
  defaultThinkingLevel: "Default thinking level",
  setupVersion: "Setup version",
  symbolPreset: "Symbol preset",
  theme: "Theme",
};

/** Render an arbitrary fact value as compact display text. */
function displayValue(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "boolean") {
    return value ? "enabled" : "disabled";
  }
  if (typeof value === "number") {
    return String(value);
  }
  if (Array.isArray(value)) {
    return value.map(displayValue).filter(Boolean).join(" · ");
  }
  // A one-level record (e.g. `theme: {dark, light}`) reads as labeled pairs;
  // raw JSON in a settings table is machine output, not an answer.
  if (typeof value === "object") {
    return Object.entries(value as Record<string, unknown>)
      .map(([key, inner]) => `${key}: ${displayValue(inner)}`)
      .join(" · ");
  }
  return String(value);
}

/** Read curated OOMPF metadata defensively (records may predate the field). */
function readMetadata(record: ProfileRecord): ProfileMetadata {
  const raw = (record as { metadata?: ProfileMetadata | null }).metadata;
  return raw ?? { kind: null, links: [], summary: null, tags: [] };
}

/** Trim a trailing slash so URL joins never double up. */
function trimTrailingSlash(url: string): string {
  return url.replace(/\/+$/, "");
}

/** True when a URL is a safe `http(s)` target (rows may predate the guard). */
function isHttpUrl(url: string): boolean {
  let protocol: string;
  try {
    protocol = new URL(url).protocol;
  } catch {
    protocol = "";
  }
  return protocol === "http:" || protocol === "https:";
}

/** Normalize a curated link to a guaranteed-labeled view. */
function toCuratedLink(link: {
  readonly label: string | null;
  readonly url: string;
}): CuratedLinkView {
  const label = link.label?.trim();
  return { label: label && label.length > 0 ? label : link.url, url: link.url };
}

/** Shape an exact selector into one friendly, effort-aware model reference. */
function toModelReference(
  selector: string,
  resolveModel: ProfileViewDeps["resolveModel"]
): ModelReferenceView {
  const parsed = parseModelSelectorDisplay(selector);
  const display = resolveModel(parsed.modelSelector);
  return {
    ...display,
    friendlyName: display.isAlias
      ? `${parsed.modelSelector.replace(/^@/, "")} role`
      : display.friendlyName,
    selector,
    thinkingLevel: parsed.thinkingLevel,
  };
}

/** Format an ISO timestamp as a stable, compact English UTC date. */
function formatIndexedLabel(indexedAt: string | null): string | null {
  if (indexedAt === null) {
    return null;
  }
  const date = new Date(indexedAt);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
    year: "numeric",
  }).format(date);
}

/** Collect advisor entries as labeled settings, skipping absent keys. */
function advisorSettings(
  advisor: ProfileRecord["facts"]["advisor"]
): BehaviorSetting[] {
  if (advisor == null) {
    return [];
  }
  const out: BehaviorSetting[] = [];
  if (advisor.enabled !== undefined) {
    out.push({ label: "Advisor", value: displayValue(advisor.enabled) });
  }
  if (advisor.syncBacklog !== undefined) {
    out.push({
      label: "Sync backlog",
      value: displayValue(advisor.syncBacklog),
    });
  }
  if (advisor.subagents !== undefined) {
    out.push({ label: "Subagents", value: displayValue(advisor.subagents) });
  }
  return out;
}

/** Collect the recognized scalar OMP fields as labeled settings. */
function fieldSettings(
  fields: ProfileRecord["facts"]["fields"]
): BehaviorSetting[] {
  const out: BehaviorSetting[] = [];
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined) {
      continue;
    }
    out.push({ label: SETTING_LABELS[key] ?? key, value: displayValue(value) });
  }
  return out;
}

/**
 * Build the ordered, render-ready view for a profile record.
 *
 * The install command uses `oompf add <canonical OOMPF URL>`. Concrete models
 * and OMP aliases are kept in separate lists, providers are never repeated as
 * requirements, and provenance is explained rather than shown as bare strings.
 */
export function buildProfileView(
  record: ProfileRecord,
  deps: ProfileViewDeps
): ProfileView {
  const origin = trimTrailingSlash(
    deps.siteOrigin && deps.siteOrigin.length > 0
      ? deps.siteOrigin
      : CANONICAL_ORIGIN
  );
  const profileUrl = `${origin}/p/${record.id}`;

  const metadata = readMetadata(record);
  const facts = record.facts;

  const models = facts.models
    .map((model) => toModelReference(model, deps.resolveModel))
    .filter((display) => !display.isAlias);
  const providers = facts.providers.map((provider) =>
    deps.resolveProvider(provider)
  );

  // Providers are surfaced under Providers only — never duplicated here.
  const requirements: RequirementView[] = facts.prerequisites
    .filter((prereq) => prereq.kind !== "provider")
    .map((prereq) => ({
      kind: prereq.kind,
      kindLabel: REQUIREMENT_LABELS[prereq.kind] ?? prereq.kind,
      name: prereq.name,
      reason: prereq.reason,
    }));

  const advisor = advisorSettings(facts.advisor);
  const settings = fieldSettings(facts.fields);
  const modelRoles = facts.modelRoles.map((entry) => ({
    model: toModelReference(entry.model, deps.resolveModel),
    role: entry.role,
  }));
  const fallbackChains = facts.fallbackChains.map((chain) => ({
    models: chain.models.map((model) =>
      toModelReference(model, deps.resolveModel)
    ),
    role: chain.role,
  }));
  const behavior: BehaviorView = {
    advisor,
    disabledProviders: facts.disabledProviders,
    extensions: facts.extensions,
    fallbackChains,
    hooks: facts.hooks,
    modelRoles,
    present:
      advisor.length > 0 ||
      settings.length > 0 ||
      modelRoles.length > 0 ||
      fallbackChains.length > 0 ||
      facts.hooks.length > 0 ||
      facts.extensions.length > 0 ||
      facts.disabledProviders.length > 0,
    settings,
  };

  const source = trimTrailingSlash(record.sourceUrl);
  const indexedAt =
    record.updatedAt instanceof Date
      ? record.updatedAt.toISOString()
      : (record.updatedAt ?? null);
  const provenance: ProvenanceView = {
    contentHash: record.contentHash,
    indexedAt,
    indexedLabel: formatIndexedLabel(indexedAt),
    owner: record.owner,
    revision: record.revision,
    revisionUrl: record.revision ? `${source}/${record.revision}` : null,
    sourceUrl: record.sourceUrl,
  };

  return {
    behavior,
    installCommand: `oompf add ${profileUrl}`,
    kind: metadata.kind,
    links: metadata.links
      .filter((link) => isHttpUrl(link.url))
      .map(toCuratedLink),
    models,
    ompVersion: record.ompVersion,
    owner: record.owner,
    profileName: record.profileName,
    profileUrl,
    provenance,
    providers,
    requirements,
    structuralValid: record.validation.structural === "valid",
    summary: metadata.summary,
    tags: metadata.tags,
    warnings: record.validation.warnings,
  };
}

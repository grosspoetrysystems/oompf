/**
 * Publisher-curated OOMPF metadata from the namespaced `oompf` block.
 *
 * OMP profiles may carry an optional top-level `oompf` mapping that is *not*
 * part of the native OMP configuration: it is OOMPF-specific, publisher-authored
 * annotation used purely for presentation and discovery (a short summary, a
 * profile kind, tags, and curated links). It is deliberately kept separate from
 * the source-derived {@link ProfileFacts}: facts are truths OOMPF extracts from
 * the config, metadata is what the author chose to declare.
 *
 * Extraction is lenient and never throws: malformed fields are dropped and
 * reported as value-free warnings so a bad annotation degrades gracefully
 * rather than blocking publication. Links are surfaced exactly as authored —
 * OOMPF never invents or guesses a link.
 */

import { isRecord } from "./guards.ts";

/** A publisher-curated link surfaced on a profile. Never guessed by OOMPF. */
export interface ProfileLink {
  /** Optional human-facing label; `null` when the author supplied only a URL. */
  readonly label: string | null;
  /** The link target exactly as authored. */
  readonly url: string;
}

/**
 * A profile kind. `value` is the label the author declared; `controlled` is
 * `true` only when that label is a member of {@link CONTROLLED_PROFILE_KINDS},
 * distinguishing a recognized vocabulary term from a free-form custom kind.
 */
export interface ProfileKind {
  readonly controlled: boolean;
  readonly value: string;
}

/** Publisher-curated OOMPF metadata; every field is optional in the source. */
export interface ProfileMetadata {
  readonly kind: ProfileKind | null;
  readonly links: readonly ProfileLink[];
  readonly summary: string | null;
  readonly tags: readonly string[];
}

/**
 * The controlled vocabulary for {@link ProfileKind.value} as a static lookup
 * table. Custom (non-member) values are still allowed; membership only flips
 * {@link ProfileKind.controlled}.
 */
const CONTROLLED_KINDS: Record<string, true> = {
  budget: true,
  coding: true,
  experimental: true,
  general: true,
  local: true,
  research: true,
  writing: true,
};

/** The controlled vocabulary values, in declaration order. */
export const CONTROLLED_PROFILE_KINDS: readonly string[] =
  Object.keys(CONTROLLED_KINDS);

/** The metadata surfaced when no (or an unusable) `oompf` block is present. */
export const EMPTY_METADATA: ProfileMetadata = {
  kind: null,
  links: [],
  summary: null,
  tags: [],
};

/** The result of extracting `oompf` metadata: the value plus value-free warnings. */
export interface MetadataExtraction {
  readonly metadata: ProfileMetadata;
  readonly warnings: readonly string[];
}

/** Coerce a summary field, warning when present but not a usable string. */
function extractSummary(value: unknown, warnings: string[]): string | null {
  if (value === undefined) {
    return null;
  }
  if (typeof value !== "string") {
    warnings.push("oompf.summary was ignored: it must be a string.");
    return null;
  }
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

/** Coerce a kind field into a controlled/custom {@link ProfileKind}. */
function extractKind(value: unknown, warnings: string[]): ProfileKind | null {
  if (value === undefined) {
    return null;
  }
  if (typeof value !== "string") {
    warnings.push("oompf.kind was ignored: it must be a string.");
    return null;
  }
  const trimmed = value.trim();
  if (trimmed === "") {
    return null;
  }
  return {
    controlled: Object.hasOwn(CONTROLLED_KINDS, trimmed),
    value: trimmed,
  };
}

/** Coerce a tags field into a de-duplicated list of non-empty strings. */
function extractTags(value: unknown, warnings: string[]): string[] {
  if (value === undefined) {
    return [];
  }
  if (!Array.isArray(value)) {
    warnings.push("oompf.tags was ignored: it must be a list of strings.");
    return [];
  }
  const tags: string[] = [];
  let droppedNonString = false;
  for (const entry of value) {
    if (typeof entry !== "string") {
      droppedNonString = true;
      continue;
    }
    const trimmed = entry.trim();
    if (trimmed !== "" && !tags.includes(trimmed)) {
      tags.push(trimmed);
    }
  }
  if (droppedNonString) {
    warnings.push("oompf.tags dropped one or more non-string entries.");
  }
  return tags;
}

/** Coerce a single link entry (string URL or `{ url, label? }`) into a link. */
function extractLink(entry: unknown, warnings: string[]): ProfileLink | null {
  if (typeof entry === "string") {
    const url = entry.trim();
    if (url === "") {
      warnings.push("oompf.links dropped an entry with an empty URL.");
      return null;
    }
    return { label: null, url };
  }
  if (isRecord(entry)) {
    const rawUrl = entry.url;
    if (typeof rawUrl !== "string" || rawUrl.trim() === "") {
      warnings.push("oompf.links dropped an entry missing a string `url`.");
      return null;
    }
    const label =
      typeof entry.label === "string" && entry.label.trim() !== ""
        ? entry.label.trim()
        : null;
    return { label, url: rawUrl.trim() };
  }
  warnings.push(
    "oompf.links dropped an entry that was not a string or object."
  );
  return null;
}

/** Coerce a links field into a list of curated {@link ProfileLink}s. */
function extractLinks(value: unknown, warnings: string[]): ProfileLink[] {
  if (value === undefined) {
    return [];
  }
  if (!Array.isArray(value)) {
    warnings.push(
      "oompf.links was ignored: it must be a list of URLs or link objects."
    );
    return [];
  }
  const links: ProfileLink[] = [];
  for (const entry of value) {
    const link = extractLink(entry, warnings);
    if (link) {
      links.push(link);
    }
  }
  return links;
}

/**
 * Extract publisher-curated {@link ProfileMetadata} from a parsed profile
 * document's optional top-level `oompf` block.
 *
 * The input document is never mutated. When `oompf` is absent the result is
 * {@link EMPTY_METADATA} with no warnings; when it is present but malformed,
 * usable fields are kept and the rest surface as value-free warnings.
 */
export function extractMetadata(
  document: Record<string, unknown>
): MetadataExtraction {
  const raw = document.oompf;
  if (raw === undefined) {
    return { metadata: EMPTY_METADATA, warnings: [] };
  }
  const warnings: string[] = [];
  if (!isRecord(raw)) {
    warnings.push("oompf metadata was ignored: it must be a mapping.");
    return { metadata: EMPTY_METADATA, warnings };
  }
  return {
    metadata: {
      kind: extractKind(raw.kind, warnings),
      links: extractLinks(raw.links, warnings),
      summary: extractSummary(raw.summary, warnings),
      tags: extractTags(raw.tags, warnings),
    },
    warnings,
  };
}

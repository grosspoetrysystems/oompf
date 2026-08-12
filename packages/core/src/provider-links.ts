/**
 * Curated provider/model display registry.
 *
 * OOMPF profiles reference models as `<provider>/<model>` selectors (plus
 * `@alias` references). This module is the single source of truth mapping those
 * raw selectors to displayable names and *curated* canonical links. It is
 * consumed by the web `/api/v1/mappings/*` routes and the profile page, and by
 * the CLI where model/provider display is needed.
 *
 * Links are curated, never guessed: a `url` is non-`null` only when this module
 * declares one for a known provider/model. An unknown provider still resolves
 * (so display never fails) but carries `url: null` and its raw id as the label.
 * Alias selectors (`@name`) are surfaced as-is with `isAlias: true` and no
 * provider or link.
 */

/** A provider's display info and curated homepage/docs link. */
export interface ProviderLink {
  readonly displayName: string;
  readonly providerId: string;
  /** Curated canonical link; `null` when none is known. Never guessed. */
  readonly url: string | null;
}

/** A model selector's display info: friendly name, provider, and curated link. */
export interface ModelDisplay {
  /** The friendly model name (the selector tail, or the `@alias` verbatim). */
  readonly friendlyName: string;
  /** `true` when the selector is an `@alias` reference, not a concrete model. */
  readonly isAlias: boolean;
  /** Owning provider id, or `null` for aliases and unqualified selectors. */
  readonly providerId: string | null;
  /** The raw selector exactly as written in the profile. */
  readonly selector: string;
  /** Curated canonical link for the model; `null` when none is known. */
  readonly url: string | null;
}

/** Thinking levels OMP accepts as explicit model-selector suffixes. */
export type ModelThinkingLevel =
  | "inherit"
  | "off"
  | "minimal"
  | "low"
  | "medium"
  | "high"
  | "xhigh"
  | "max"
  | "auto";

/** A model selector split into its base model and optional thinking effort. */
export interface ModelSelectorDisplay {
  readonly modelSelector: string;
  readonly thinkingLevel: ModelThinkingLevel | null;
}

/** Parse a model selector for profile-page display. */
export function parseModelSelectorDisplay(
  selector: string
): ModelSelectorDisplay {
  const colon = selector.lastIndexOf(":");
  if (colon <= 0) {
    return { modelSelector: selector, thinkingLevel: null };
  }

  const suffix = selector.slice(colon + 1);
  const strictLevel = normalizeThinkingLevel(suffix, STRICT_THINKING_LEVELS);
  if (strictLevel !== null) {
    return {
      modelSelector: selector.slice(0, colon),
      thinkingLevel: strictLevel,
    };
  }

  const guardedLevel =
    suffix === "auto"
      ? "auto"
      : normalizeThinkingLevel(suffix, GUARDED_THINKING_LEVELS);
  const modelSelector = selector.slice(0, colon);
  if (
    guardedLevel !== null &&
    isCuratedModelSelector(modelSelector) &&
    !isCuratedModelSelector(selector)
  ) {
    return { modelSelector, thinkingLevel: guardedLevel };
  }

  return { modelSelector: selector, thinkingLevel: null };
}

/** A curated model entry within a provider. */
interface ModelEntry {
  readonly label: string;
  readonly url: string | null;
}

/** A curated provider entry: display info plus its known models. */
interface ProviderEntry {
  readonly displayName: string;
  readonly models: Record<string, ModelEntry>;
  readonly url: string | null;
}

/**
 * The curated registry. Provider ids match the segment before `/` in a model
 * selector. Model keys match the segment after `/`. Only links we can state
 * with confidence are recorded; everything else stays `null`.
 */
const REGISTRY: Record<string, ProviderEntry> = {
  anthropic: {
    displayName: "Anthropic",
    models: {
      "claude-haiku-4": {
        label: "Claude Haiku 4",
        url: "https://docs.anthropic.com/en/docs/about-claude/models",
      },
      "claude-opus-4": {
        label: "Claude Opus 4",
        url: "https://docs.anthropic.com/en/docs/about-claude/models",
      },
      "claude-sonnet-4": {
        label: "Claude Sonnet 4",
        url: "https://docs.anthropic.com/en/docs/about-claude/models",
      },
    },
    url: "https://www.anthropic.com",
  },
  deepseek: {
    displayName: "DeepSeek",
    models: {
      "deepseek-r1": {
        label: "DeepSeek-R1",
        url: "https://api-docs.deepseek.com",
      },
      "deepseek-v3": {
        label: "DeepSeek-V3",
        url: "https://api-docs.deepseek.com",
      },
    },
    url: "https://www.deepseek.com",
  },
  google: {
    displayName: "Google",
    models: {
      "gemini-2.5-flash": {
        label: "Gemini 2.5 Flash",
        url: "https://ai.google.dev/gemini-api/docs/models",
      },
      "gemini-2.5-pro": {
        label: "Gemini 2.5 Pro",
        url: "https://ai.google.dev/gemini-api/docs/models",
      },
    },
    url: "https://ai.google.dev",
  },
  meta: {
    displayName: "Meta",
    models: {
      "llama-3.3-70b": { label: "Llama 3.3 70B", url: null },
    },
    url: "https://ai.meta.com",
  },
  mistral: {
    displayName: "Mistral AI",
    models: {
      "mistral-large": { label: "Mistral Large", url: null },
    },
    url: "https://mistral.ai",
  },
  ollama: {
    displayName: "Ollama",
    models: {
      "qwen3.6": {
        label: "Qwen 3.6",
        url: "https://ollama.com/library/qwen3.6",
      },
    },
    url: "https://ollama.com/library",
  },
  openai: {
    displayName: "OpenAI",
    models: {
      "gpt-4o": {
        label: "GPT-4o",
        url: "https://platform.openai.com/docs/models",
      },
      "gpt-4o-mini": {
        label: "GPT-4o mini",
        url: "https://platform.openai.com/docs/models",
      },
      o1: { label: "o1", url: "https://platform.openai.com/docs/models" },
    },
    url: "https://openai.com",
  },
  "opencode-go": {
    displayName: "OpenCode Go",
    models: {
      "kimi-k2.7-code": {
        label: "Kimi K2.7 Code",
        url: "https://opencode.ai/zen/go/v1/models",
      },
    },
    url: "https://opencode.ai/zen/go/v1/models",
  },
  "x-ai": {
    displayName: "xAI",
    models: {
      "grok-2": { label: "Grok 2", url: null },
    },
    url: "https://x.ai",
  },
};

const STRICT_THINKING_LEVELS = [
  "inherit",
  "off",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
] as const satisfies readonly ModelThinkingLevel[];

const GUARDED_THINKING_LEVELS = [
  "max",
] as const satisfies readonly ModelThinkingLevel[];

/** Match exact values and OMP's unambiguous abbreviations of two characters. */
function normalizeThinkingLevel(
  value: string,
  levels: readonly ModelThinkingLevel[]
): ModelThinkingLevel | null {
  if (value.length < 2) {
    return null;
  }
  const matches = levels.filter((level) => level.startsWith(value));
  return matches.length === 1 ? (matches[0] ?? null) : null;
}

/** True only for exact entries in OOMPF's curated provider/model registry. */
function isCuratedModelSelector(selector: string): boolean {
  const slash = selector.indexOf("/");
  if (slash <= 0) {
    return false;
  }
  const providerId = selector.slice(0, slash);
  const modelId = selector.slice(slash + 1);
  return Object.hasOwn(REGISTRY[providerId]?.models ?? {}, modelId);
}

/**
 * Resolve display info and a curated link for a provider id. Never fails: an
 * unknown provider echoes its id as the display name with a `null` link.
 */
export function resolveProviderLink(provider: string): ProviderLink {
  const entry = REGISTRY[provider];
  if (entry) {
    return {
      displayName: entry.displayName,
      providerId: provider,
      url: entry.url,
    };
  }
  return { displayName: provider, providerId: provider, url: null };
}

/**
 * Resolve display info for a model selector. `@alias` references are surfaced
 * verbatim with `isAlias: true` and no provider/link; concrete `provider/model`
 * selectors get their curated label and link when known, otherwise the raw
 * tail as the friendly name and a `null` link.
 */
export function resolveModelDisplay(model: string): ModelDisplay {
  if (model.startsWith("@")) {
    return {
      friendlyName: model,
      isAlias: true,
      providerId: null,
      selector: model,
      url: null,
    };
  }
  const slash = model.indexOf("/");
  if (slash <= 0) {
    return {
      friendlyName: model,
      isAlias: false,
      providerId: null,
      selector: model,
      url: null,
    };
  }
  const providerId = model.slice(0, slash);
  const tail = model.slice(slash + 1);
  const curated = REGISTRY[providerId]?.models[tail];
  return {
    friendlyName: curated?.label ?? tail,
    isAlias: false,
    providerId,
    selector: model,
    url: curated?.url ?? null,
  };
}

/** List every curated provider link, ordered by provider id. */
export function listProviderLinks(): readonly ProviderLink[] {
  return Object.keys(REGISTRY)
    .sort()
    .map((providerId) => {
      const entry = REGISTRY[providerId]!;
      return {
        displayName: entry.displayName,
        providerId,
        url: entry.url,
      };
    });
}

/**
 * List a provider's curated models as {@link ModelDisplay}s, or `null` when the
 * provider is not in the registry (so a route can answer 404).
 */
export function listProviderModels(
  providerId: string
): readonly ModelDisplay[] | null {
  const entry = REGISTRY[providerId];
  if (!entry) {
    return null;
  }
  return Object.keys(entry.models)
    .sort()
    .map((tail) => {
      const model = entry.models[tail]!;
      return {
        friendlyName: model.label,
        isAlias: false,
        providerId,
        selector: `${providerId}/${tail}`,
        url: model.url,
      };
    });
}

/**
 * Code-reviewed model equivalence catalog for `oompf upgrade`.
 *
 * This is deliberately separate from `provider-links.ts`: presentation links
 * answer "where can a reader learn about this model?"; this catalog answers
 * "is there an explicit successor for this role/tier?". No provider feed or
 * inference call can invent a successor at upgrade time.
 */

export type ModelTier = "balanced" | "economy" | "frontier";
export type ModelRole = "chat" | "coding" | "planning" | "review";
export type ReasoningClass = "none" | "reasoning" | "standard";
export type DeploymentClass = "hosted" | "open-weight";

/** One reviewed model entry in the upgrade catalog. */
export interface ModelCatalogEntry {
  readonly deployment: DeploymentClass;
  readonly docsUrl: string | null;
  readonly id: string;
  readonly providerId: string;
  readonly reasoning: ReasoningClass;
  readonly roles: readonly ModelRole[];
  readonly successor: string | null;
  readonly tier: ModelTier;
}

/** Immutable catalog payload consumed by the pure upgrade planner. */
export interface ModelCatalog {
  readonly models: readonly ModelCatalogEntry[];
  readonly revision: string;
}

/**
 * GPS-150-1 is the first reviewed snapshot. A catalog revision changes only
 * when its mappings change in a normal code review; upgrade output reports it
 * so a proposed change remains attributable and reproducible.
 */
export const MODEL_CATALOG: ModelCatalog = {
  models: [
    {
      deployment: "hosted",
      docsUrl: "https://docs.anthropic.com/en/docs/about-claude/models",
      id: "anthropic/claude-opus-4",
      providerId: "anthropic",
      reasoning: "reasoning",
      roles: ["coding", "planning", "review"],
      successor: "anthropic/claude-opus-4-8",
      tier: "frontier",
    },
    {
      deployment: "hosted",
      docsUrl: "https://docs.anthropic.com/en/docs/about-claude/models",
      id: "anthropic/claude-opus-4-8",
      providerId: "anthropic",
      reasoning: "reasoning",
      roles: ["coding", "planning", "review"],
      successor: null,
      tier: "frontier",
    },
    {
      deployment: "hosted",
      docsUrl: "https://docs.anthropic.com/en/docs/about-claude/models",
      id: "anthropic/claude-haiku-4",
      providerId: "anthropic",
      reasoning: "standard",
      roles: ["chat", "coding"],
      successor: null,
      tier: "economy",
    },
  ],
  revision: "gps-150-1",
};

/** Find a reviewed catalog model by its full provider/model id. */
export function findCatalogModel(id: string): ModelCatalogEntry | null {
  return MODEL_CATALOG.models.find((model) => model.id === id) ?? null;
}

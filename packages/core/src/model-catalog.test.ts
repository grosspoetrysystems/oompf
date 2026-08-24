import { describe, expect, test } from "bun:test";

import {
  findCatalogModel,
  MODEL_CATALOG,
  type ModelCatalogEntry,
} from "./model-catalog.ts";

describe("model catalog", () => {
  test("has a stable revision and unique model ids", () => {
    expect(MODEL_CATALOG.revision).toMatch(/^gps-150-/);
    const ids = MODEL_CATALOG.models.map((model) => model.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test("successors point to catalog entries", () => {
    const ids = new Set(MODEL_CATALOG.models.map((model) => model.id));
    for (const model of MODEL_CATALOG.models) {
      if (model.successor !== null) {
        expect(ids.has(model.successor)).toBe(true);
      }
    }
  });

  test("finds a known model and rejects unknown ids", () => {
    const known = findCatalogModel("anthropic/claude-opus-4");
    expect(known).toEqual<ModelCatalogEntry>({
      deployment: "hosted",
      docsUrl: "https://docs.anthropic.com/en/docs/about-claude/models",
      id: "anthropic/claude-opus-4",
      providerId: "anthropic",
      reasoning: "reasoning",
      roles: ["coding", "planning", "review"],
      successor: "anthropic/claude-opus-4-8",
      tier: "frontier",
    });
    expect(findCatalogModel("unknown/model")).toBeNull();
  });
});

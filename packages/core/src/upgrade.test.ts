import { describe, expect, test } from "bun:test";
import { parse } from "yaml";

import type { ModelCatalog } from "./model-catalog.ts";
import { proposeUpgrade } from "./upgrade.ts";

const CATALOG: ModelCatalog = {
  models: [
    {
      deployment: "hosted",
      docsUrl: null,
      id: "anthropic/claude-opus-4",
      providerId: "anthropic",
      reasoning: "reasoning",
      roles: ["planning", "coding"],
      successor: "anthropic/claude-opus-4.8",
      tier: "frontier",
    },
    {
      deployment: "hosted",
      docsUrl: null,
      id: "anthropic/claude-opus-4.8",
      providerId: "anthropic",
      reasoning: "reasoning",
      roles: ["planning", "coding"],
      successor: null,
      tier: "frontier",
    },
    {
      deployment: "hosted",
      docsUrl: null,
      id: "google/gemini-2.5-pro",
      providerId: "google",
      reasoning: "standard",
      roles: ["chat"],
      successor: null,
      tier: "balanced",
    },
    {
      deployment: "hosted",
      docsUrl: null,
      id: "vendor/old",
      providerId: "vendor",
      reasoning: "reasoning",
      roles: ["planning"],
      successor: "vendor/new",
      tier: "frontier",
    },
    {
      deployment: "hosted",
      docsUrl: null,
      id: "vendor/new",
      providerId: "vendor",
      reasoning: "reasoning",
      roles: ["planning"],
      successor: null,
      tier: "frontier",
    },
  ],
  revision: "test-1",
};

const YAML = `name: upgrade-me
modelRoles:
  planner: anthropic/claude-opus-4:high
  fallback:
    - anthropic/claude-opus-4
    - '@local'
enabledModels:
  - anthropic/claude-opus-4
retry:
  fallbackChains:
    default:
      - anthropic/claude-opus-4
      - google/gemini-2.5-pro
advisor:
  enabled: true
unknown:
  keep: true
`;

describe("proposeUpgrade", () => {
  test("replaces recognized selectors and preserves strategy fields", () => {
    const plan = proposeUpgrade(YAML, CATALOG);
    const document = parse(plan.yaml) as Record<string, any>;

    expect(plan.catalogRevision).toBe("test-1");
    expect(plan.changes).toHaveLength(4);
    expect(document.modelRoles.planner).toBe("anthropic/claude-opus-4.8:high");
    expect(document.modelRoles.fallback).toEqual([
      "anthropic/claude-opus-4.8",
      "@local",
    ]);
    expect(document.enabledModels).toEqual(["anthropic/claude-opus-4.8"]);
    expect(document.retry.fallbackChains.default).toEqual([
      "anthropic/claude-opus-4.8",
      "google/gemini-2.5-pro",
    ]);
    expect(document.advisor).toEqual({ enabled: true });
    expect(document.unknown).toEqual({ keep: true });
  });

  test("reports unchanged selectors without inventing replacements", () => {
    const plan = proposeUpgrade(
      "modelRoles:\n  chat: google/gemini-2.5-pro\n  unknown: vendor/unknown\n",
      CATALOG
    );

    expect(plan.changes).toEqual([]);
    expect(plan.unchanged).toEqual([
      {
        model: "google/gemini-2.5-pro",
        path: "modelRoles.chat",
        reason: "no_successor",
        role: "chat",
      },
      {
        model: "vendor/unknown",
        path: "modelRoles.unknown",
        reason: "unclassified",
        role: "unknown",
      },
    ]);
  });

  test("preserves comments and unrelated scalar formatting", () => {
    const plan = proposeUpgrade(
      "# profile note\nnumber: 001\nmodelRoles:\n  planner: vendor/old # keep this note\n",
      CATALOG
    );

    expect(plan.yaml).toContain("# profile note");
    expect(plan.yaml).toContain("number: 001");
    expect(plan.yaml).toContain("# keep this note");
    expect(plan.yaml).toContain("vendor/new");
  });

  test("does not reject fallback-chain successors by their chain key", () => {
    const plan = proposeUpgrade(
      "retry:\n  fallbackChains:\n    review:\n      - vendor/old\n",
      CATALOG
    );

    expect(plan.changes[0]?.to).toBe("vendor/new");
  });

  test("preserves max thinking suffixes for non-display-catalog models", () => {
    const plan = proposeUpgrade(
      "modelRoles:\n  planner: vendor/old:max\n",
      CATALOG
    );

    expect(plan.changes[0]?.to).toBe("vendor/new:max");
  });

  test("is a no-op when no recognized model location exists", () => {
    const plan = proposeUpgrade(
      "name: no-models\nadvisor:\n  enabled: true\n",
      CATALOG
    );

    expect(plan.changes).toEqual([]);
    expect(plan.unchanged).toEqual([]);
    expect(parse(plan.yaml)).toEqual({
      advisor: { enabled: true },
      name: "no-models",
    });
  });
});

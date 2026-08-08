import { describe, expect, test } from "bun:test";

import { extractFacts } from "./facts.ts";

/** A representative native OMP profile document. */
const sample: Record<string, unknown> = {
  symbolPreset: "nerd",
  theme: "dark",
  setupVersion: 7,
  defaultThinkingLevel: "high",
  disabledProviders: ["openai"],
  enabledModels: ["deepseek/deepseek-v4-flash", "openai/gpt-4o"],
  modelRoles: {
    default: "anthropic/claude-opus-4",
    smol: "anthropic/claude-haiku-4",
    task: "deepseek/deepseek-v4",
  },
  retry: {
    fallbackChains: {
      default: ["anthropic/claude-opus-4", "google/gemini-2.5-pro"],
    },
  },
  advisor: {
    enabled: true,
    subagents: ["reviewer"],
    syncBacklog: false,
  },
  hooks: ["teacher"],
  extensions: [{ name: "custom-ext", path: "/local/ext.ts" }],
  memory: { enabled: true },
  mnemopi: { store: "local" },
  inspect_image: true,
  context: { window: 200000 },
  // An unrecognized future OMP key that must be preserved, not dropped.
  futureSetting: { experimental: true },
};

describe("extractFacts", () => {
  test("captures scalar profile identity fields present", () => {
    const facts = extractFacts(sample);
    expect(facts.fields).toEqual({
      symbolPreset: "nerd",
      theme: "dark",
      setupVersion: 7,
      defaultThinkingLevel: "high",
    });
  });

  test("extracts model roles", () => {
    const facts = extractFacts(sample);
    expect(facts.modelRoles).toEqual([
      { role: "default", model: "anthropic/claude-opus-4" },
      { role: "smol", model: "anthropic/claude-haiku-4" },
      { role: "task", model: "deepseek/deepseek-v4" },
    ]);
  });

  test("collects every distinct configured model", () => {
    const facts = extractFacts(sample);
    expect(facts.models).toEqual([
      "anthropic/claude-opus-4",
      "anthropic/claude-haiku-4",
      "deepseek/deepseek-v4",
      "deepseek/deepseek-v4-flash",
      "openai/gpt-4o",
      "google/gemini-2.5-pro",
    ]);
  });

  test("extracts fallback chains from retry settings", () => {
    const facts = extractFacts(sample);
    expect(facts.fallbackChains).toEqual([
      {
        role: "default",
        models: ["anthropic/claude-opus-4", "google/gemini-2.5-pro"],
      },
    ]);
  });

  test("infers providers from model identifiers", () => {
    const facts = extractFacts(sample);
    expect(facts.providers).toEqual([
      "anthropic",
      "deepseek",
      "openai",
      "google",
    ]);
  });

  test("extracts advisor settings", () => {
    const facts = extractFacts(sample);
    expect(facts.advisor).toEqual({
      enabled: true,
      subagents: ["reviewer"],
      syncBacklog: false,
    });
  });

  test("extracts hooks and extensions by name", () => {
    const facts = extractFacts(sample);
    expect(facts.hooks).toEqual(["teacher"]);
    expect(facts.extensions).toEqual(["custom-ext"]);
  });

  test("captures memory, inspection, and context settings", () => {
    const facts = extractFacts(sample);
    expect(facts.memory).toEqual({
      memory: { enabled: true },
      mnemopi: { store: "local" },
    });
    expect(facts.inspection).toEqual({ inspect_image: true });
    expect(facts.context).toEqual({ window: 200000 });
    expect(facts.disabledProviders).toEqual(["openai"]);
  });

  test("retains unknown top-level keys", () => {
    const facts = extractFacts(sample);
    expect(facts.unknownKeys).toEqual(["futureSetting"]);
    // The source document itself is never mutated.
    expect(sample.futureSetting).toEqual({ experimental: true });
  });

  test("derives provider and extension prerequisites", () => {
    const facts = extractFacts(sample);
    const providerPrereqs = facts.prerequisites
      .filter((p) => p.kind === "provider")
      .map((p) => p.name);
    expect(providerPrereqs).toEqual([
      "anthropic",
      "deepseek",
      "openai",
      "google",
    ]);
    const extensionPrereqs = facts.prerequisites
      .filter((p) => p.kind === "extension")
      .map((p) => p.name);
    expect(extensionPrereqs).toEqual(["teacher", "custom-ext"]);
  });

  test("derives environment and project-overlay prerequisites", () => {
    const facts = extractFacts({
      modelRoles: { default: "anthropic/claude-opus-4" },
      baseUrl: "${OMP_BASE_URL}",
      projectOverlays: [".omp/config.yml"],
    });
    const env = facts.prerequisites.filter((p) => p.kind === "environment");
    expect(env).toEqual([
      {
        kind: "environment",
        name: "OMP_BASE_URL",
        reason: 'Environment variable "OMP_BASE_URL" must be set in the local runtime.',
      },
    ]);
    const overlays = facts.prerequisites.filter(
      (p) => p.kind === "project-overlay",
    );
    expect(overlays.map((p) => p.name)).toEqual([".omp/config.yml"]);
  });

  test("returns empty facts for a minimal document", () => {
    const facts = extractFacts({ theme: "light" });
    expect(facts.modelRoles).toEqual([]);
    expect(facts.models).toEqual([]);
    expect(facts.providers).toEqual([]);
    expect(facts.advisor).toBeNull();
    expect(facts.prerequisites).toEqual([]);
    expect(facts.memory).toBeNull();
    expect(facts.context).toBeNull();
  });
});

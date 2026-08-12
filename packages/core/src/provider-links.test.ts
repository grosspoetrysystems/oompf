import { describe, expect, test } from "bun:test";
import {
  parseModelSelectorDisplay,
  resolveModelDisplay,
  resolveProviderLink,
} from "./provider-links.ts";

describe("provider and model permalinks", () => {
  test("links a known OpenCode Go model to its provider model page", () => {
    expect(resolveModelDisplay("opencode-go/kimi-k2.7-code")).toEqual({
      friendlyName: "Kimi K2.7 Code",
      isAlias: false,
      providerId: "opencode-go",
      selector: "opencode-go/kimi-k2.7-code",
      url: "https://opencode.ai/zen/go/v1/models",
    });
  });

  test("links a known Ollama model to its library permalink", () => {
    expect(resolveModelDisplay("ollama/qwen3.6").url).toBe(
      "https://ollama.com/library/qwen3.6"
    );
  });

  test("does not invent links for unknown selectors", () => {
    expect(
      resolveModelDisplay("unknown-provider/unknown-model").url
    ).toBeNull();
    expect(resolveProviderLink("unknown-provider").url).toBeNull();
  });
});

describe("model selector display parsing", () => {
  test("separates an explicit thinking suffix from the model id", () => {
    expect(parseModelSelectorDisplay("anthropic/claude-opus-4:high")).toEqual({
      modelSelector: "anthropic/claude-opus-4",
      thinkingLevel: "high",
    });
  });

  test("normalizes OMP's unambiguous thinking abbreviations", () => {
    expect(parseModelSelectorDisplay("anthropic/claude-opus-4:xhi")).toEqual({
      modelSelector: "anthropic/claude-opus-4",
      thinkingLevel: "xhigh",
    });
  });

  test("preserves a literal model tag", () => {
    expect(parseModelSelectorDisplay("ollama/qwen3.6:latest")).toEqual({
      modelSelector: "ollama/qwen3.6:latest",
      thinkingLevel: null,
    });
  });

  test("preserves an ambiguous max suffix on an unknown model", () => {
    expect(parseModelSelectorDisplay("unknown/glm-4.7:max")).toEqual({
      modelSelector: "unknown/glm-4.7:max",
      thinkingLevel: null,
    });
  });

  test("separates a guarded max suffix from a curated model", () => {
    expect(parseModelSelectorDisplay("anthropic/claude-opus-4:max")).toEqual({
      modelSelector: "anthropic/claude-opus-4",
      thinkingLevel: "max",
    });
  });
});

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

  test("resolves live indexed provider/model selectors to their docs", () => {
    expect(resolveModelDisplay("openai-codex/gpt-5.6-luna")).toEqual({
      friendlyName: "GPT-5.6 Luna",
      isAlias: false,
      providerId: "openai-codex",
      selector: "openai-codex/gpt-5.6-luna",
      url: "https://platform.openai.com/docs/models",
    });
    expect(resolveModelDisplay("openai-codex/gpt-5.5").url).toBe(
      "https://platform.openai.com/docs/models"
    );
    expect(resolveModelDisplay("moonshotai/kimi-k2.6").url).toBe(
      "https://platform.moonshot.ai"
    );
    expect(resolveModelDisplay("z-ai/glm-5.2").url).toBe("https://docs.z.ai/");
    expect(resolveModelDisplay("anthropic/claude-opus-4-8").url).toContain(
      "docs.anthropic.com"
    );
    expect(resolveModelDisplay("anthropic/claude-haiku-4.6").url).toContain(
      "docs.anthropic.com"
    );
    expect(resolveModelDisplay("google/gemini-3.5-pro").url).toContain(
      "ai.google.dev"
    );
    expect(resolveModelDisplay("deepseek/deepseek-v4-flash").url).toBe(
      "https://api-docs.deepseek.com"
    );
    expect(resolveModelDisplay("openai/gpt-5.6").url).toContain(
      "platform.openai.com"
    );
    expect(resolveModelDisplay("opencode-go/glm-5.2").url).toBe(
      "https://opencode.ai/zen/go/v1/models"
    );
    expect(resolveModelDisplay("opencode-go/kimi-k3").url).toBe(
      "https://opencode.ai/zen/go/v1/models"
    );
    // The `:latest` tag is not a thinking level; it must still resolve to the
    // curated base model's destination rather than falling to url: null.
    expect(resolveModelDisplay("ollama/qwen3.6:latest").url).toBe(
      "https://ollama.com/library/qwen3.6"
    );
  });

  test("resolves the newly added provider homepages", () => {
    expect(resolveProviderLink("openai-codex").url).toBe(
      "https://developers.openai.com/codex/cli"
    );
    expect(resolveProviderLink("moonshotai").url).toBe(
      "https://platform.moonshot.ai"
    );
    expect(resolveProviderLink("z-ai").url).toBe("https://docs.z.ai/");
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

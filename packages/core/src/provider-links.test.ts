import { describe, expect, test } from "bun:test";
import { resolveModelDisplay, resolveProviderLink } from "./provider-links.ts";

describe("provider and model permalinks", () => {
  test("links a known OpenCode Go model to its provider model page", () => {
    expect(resolveModelDisplay("opencode-go/kimi-k2.7-code")).toEqual({
      friendlyName: "Kimi K2.7 Code",
      isAlias: false,
      providerId: "opencode-go",
      selector: "opencode-go/kimi-k2.7-code",
      url: "https://opencode.ai/docs/models/",
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

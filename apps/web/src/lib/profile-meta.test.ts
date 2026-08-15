import { describe, expect, test } from "bun:test";
import { resolveModelDisplay, resolveProviderLink } from "@oompf/core";
import type { ProfileRecord } from "@oompf/database";
import { buildProfileMeta } from "./profile-meta.ts";
import { buildProfileView } from "./profile-view.ts";

function profileRecord(): ProfileRecord {
  return {
    contentHash: "f".repeat(64),
    createdAt: new Date("2026-08-10T12:00:00.000Z"),
    facts: {
      advisor: { enabled: false, subagents: false },
      aliases: ["@tiny"],
      context: null,
      disabledProviders: [],
      extensions: [],
      fallbackChains: [],
      fields: {},
      hooks: [],
      inspection: null,
      memory: null,
      modelRoles: [
        { model: "anthropic/claude-opus-4:high", role: "slow" },
        { model: "@tiny", role: "commit" },
      ],
      models: ["anthropic/claude-opus-4:high"],
      prerequisites: [],
      providers: ["anthropic", "ollama"],
      unknownKeys: [],
    },
    gistId: "abc123",
    id: "prof_0123456789abcdef0123456789abcdef",
    metadata: {
      kind: null,
      links: [],
      summary: null,
      tags: [],
    },
    ompVersion: "1.0.0",
    owner: "octocat",
    profileName: "reasoning-profile",
    revision: null,
    sourceType: "gist",
    sourceUrl: "https://gist.github.com/octocat/abc123",
    updatedAt: new Date("2026-08-12T14:54:05.478Z"),
    validation: {
      findings: [],
      hash: "f".repeat(64),
      structural: "valid",
      warnings: [],
    },
  };
}

function buildMeta(record: ProfileRecord = profileRecord()) {
  const view = buildProfileView(record, {
    resolveModel: resolveModelDisplay,
    resolveProvider: resolveProviderLink,
    siteOrigin: "https://oompf.run",
  });
  return buildProfileMeta(view);
}

describe("profile social meta", () => {
  test("derives title, one-line facts description, and canonical URL", () => {
    const meta = buildMeta();

    expect(meta.title).toBe("reasoning-profile by octocat — OOMPF");
    expect(meta.description).toBe(
      "slow: Claude Opus 4 · commit: tiny role · 2 providers · updated Aug 12, 2026"
    );
    expect(meta.url).toBe(
      "https://oompf.run/p/prof_0123456789abcdef0123456789abcdef"
    );
  });
});

import { describe, expect, test } from "bun:test";
import { resolveModelDisplay, resolveProviderLink } from "@oompf/core";
import type { ProfileRecord } from "@oompf/database";
import { buildProfileView } from "./profile-view.ts";

function profileRecord(): ProfileRecord {
  return {
    checkFailures: 0,
    contentHash: "f".repeat(64),
    createdAt: new Date("2026-08-10T12:00:00.000Z"),
    facts: {
      advisor: { enabled: false, subagents: false },
      aliases: ["@tiny"],
      context: null,
      disabledProviders: [],
      extensions: [],
      fallbackChains: [
        {
          models: ["anthropic/claude-opus-4:high", "ollama/qwen3.6:latest"],
          role: "slow",
        },
      ],
      fields: { defaultThinkingLevel: "auto", setupVersion: 1 },
      hooks: [],
      inspection: null,
      memory: null,
      modelRoles: [
        { model: "anthropic/claude-opus-4:high", role: "slow" },
        { model: "@tiny", role: "commit" },
      ],
      models: ["anthropic/claude-opus-4:high", "ollama/qwen3.6:latest"],
      prerequisites: [
        {
          kind: "provider",
          name: "anthropic",
          reason: "Provider access is configured locally.",
        },
        {
          kind: "environment",
          name: "ANTHROPIC_API_KEY",
          reason: "Environment variable must be set.",
        },
      ],
      providers: ["anthropic", "ollama"],
      unknownKeys: [],
    },
    gistId: "abc123",
    id: "prof_0123456789abcdef0123456789abcdef",
    lastCheckError: null,
    lastCheckedAt: null,
    metadata: {
      kind: null,
      links: [],
      summary: "A deliberate reasoning profile.",
      tags: ["reasoning"],
    },
    ompVersion: "1.0.0",
    owner: "octocat",
    profileName: "reasoning-profile",
    revision: "92a08aef1d67525afb11f239588883be94401d84",
    sourceChangedAt: null,
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

function buildView() {
  return buildProfileView(profileRecord(), {
    resolveModel: resolveModelDisplay,
    resolveProvider: resolveProviderLink,
    siteOrigin: "https://oompf.run",
  });
}

describe("profile detail presentation", () => {
  test("separates thinking effort without splitting literal model tags", () => {
    const view = buildView();

    expect(view.models[0]).toMatchObject({
      friendlyName: "Claude Opus 4",
      selector: "anthropic/claude-opus-4:high",
      thinkingLevel: "high",
    });
    expect(view.models[1]).toMatchObject({
      friendlyName: "qwen3.6:latest",
      selector: "ollama/qwen3.6:latest",
      thinkingLevel: null,
    });
  });

  test("uses friendly model references inside behavior facts", () => {
    const view = buildView();

    expect(view.behavior.modelRoles[0]).toMatchObject({
      model: {
        friendlyName: "Claude Opus 4",
        selector: "anthropic/claude-opus-4:high",
        thinkingLevel: "high",
      },
      role: "slow",
    });
    expect(view.behavior.modelRoles[1]?.model).toMatchObject({
      friendlyName: "tiny role",
      isAlias: true,
      selector: "@tiny",
    });
    expect(view.behavior.fallbackChains[0]?.models[1]).toMatchObject({
      friendlyName: "qwen3.6:latest",
      thinkingLevel: null,
    });
  });

  test("formats source context and keeps only actionable requirements", () => {
    const view = buildView();

    expect(view.provenance.indexedLabel).toBe("Aug 12, 2026");
    expect(view.requirements).toEqual([
      {
        kind: "environment",
        kindLabel: "Environment variable",
        name: "ANTHROPIC_API_KEY",
        reason: "Environment variable must be set.",
      },
    ]);
  });

  test("filters stored non-http(s) curated links at render", () => {
    const record = profileRecord();
    record.metadata = {
      kind: null,
      links: [
        { label: null, url: "javascript:alert(1)" },
        { label: null, url: "https://example.com" },
      ],
      summary: null,
      tags: [],
    };

    const view = buildProfileView(record, {
      resolveModel: resolveModelDisplay,
      resolveProvider: resolveProviderLink,
      siteOrigin: "https://oompf.run",
    });

    expect(view.links).toEqual([
      { label: "https://example.com", url: "https://example.com" },
    ]);
  });

  /** The freshness block for a record carrying the given sweep-tracked state. */
  function freshnessOf(overrides: {
    checkFailures?: number;
    lastCheckedAt?: Date | null;
    sourceChangedAt?: Date | null;
  }) {
    return buildProfileView(
      { ...profileRecord(), ...overrides },
      {
        resolveModel: resolveModelDisplay,
        resolveProvider: resolveProviderLink,
        siteOrigin: "https://oompf.run",
      }
    ).freshness;
  }

  test("derives a current state when the source matched at the last check", () => {
    expect(
      freshnessOf({
        checkFailures: 0,
        lastCheckedAt: new Date("2026-08-15T09:30:00.000Z"),
        sourceChangedAt: null,
      })
    ).toEqual({
      checkedAt: "2026-08-15T09:30:00.000Z",
      checkedLabel: "Aug 15, 2026",
      label: "source current",
      note: "The indexed metadata matched the source at the last check.",
      state: "current",
    });
  });

  test("derives a changed state when the source drifted since indexing", () => {
    expect(
      freshnessOf({
        lastCheckedAt: new Date("2026-08-16T09:30:00.000Z"),
        sourceChangedAt: new Date("2026-08-16T09:30:00.000Z"),
      }).state
    ).toBe("changed");
  });

  test("derives an unreachable state after two consecutive failures", () => {
    expect(
      freshnessOf({
        checkFailures: 2,
        lastCheckedAt: new Date("2026-08-16T09:30:00.000Z"),
      }).state
    ).toBe("unreachable");
  });

  test("prefers unreachable over changed when both conditions hold", () => {
    expect(
      freshnessOf({
        checkFailures: 2,
        lastCheckedAt: new Date("2026-08-16T09:30:00.000Z"),
        sourceChangedAt: new Date("2026-08-16T09:30:00.000Z"),
      }).state
    ).toBe("unreachable");
  });

  test("a single failure reads as a failed check, never as current", () => {
    expect(
      freshnessOf({
        checkFailures: 1,
        lastCheckedAt: new Date("2026-08-16T09:30:00.000Z"),
      })
    ).toEqual({
      checkedAt: "2026-08-16T09:30:00.000Z",
      checkedLabel: "Aug 16, 2026",
      label: "check failed",
      note: "The most recent check could not fetch the source; it will be retried, and repeated failures are flagged.",
      state: "check_failed",
    });
  });

  test("renders unchecked until the first sweep has run", () => {
    expect(freshnessOf({})).toEqual({
      checkedAt: null,
      checkedLabel: null,
      label: "not re-checked",
      note: "This profile has not been re-checked since it was indexed.",
      state: "unchecked",
    });
  });
});

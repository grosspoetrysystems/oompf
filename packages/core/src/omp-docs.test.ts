import { describe, expect, test } from "bun:test";

import { OMP_DOCS, OMP_REPO, OMP_SITE, ompDocLink } from "./omp-docs.ts";

describe("ompDocs", () => {
  test("every curated link targets the OMP docs on main", () => {
    expect(OMP_DOCS.length).toBeGreaterThan(5);
    for (const link of OMP_DOCS) {
      expect(link.href.startsWith(`${OMP_REPO}/blob/main/docs/`)).toBe(true);
      expect(link.label.length).toBeGreaterThan(2);
    }
  });

  test("the site home link and the repo root are distinct", () => {
    expect(OMP_SITE).toContain("omp.sh");
    expect(OMP_REPO).toContain("github.com/can1357/oh-my-pi");
    expect(OMP_SITE).not.toBe(OMP_REPO);
  });

  test("every concept key resolves, and unknown keys resolve to null", () => {
    const keys = [
      "advisor",
      "agents",
      "context",
      "disabledProviders",
      "extensions",
      "fallbackChains",
      "hooks",
      "mcp",
      "memory",
      "models",
      "modelRoles",
      "precedence",
      "profiles",
      "providers",
      "settings",
    ];
    for (const key of keys) {
      const link = ompDocLink(key);
      expect(link, `expected a link for ${key}`).not.toBeNull();
      expect(link?.href).toContain("/docs/");
      expect(link?.href).toContain("#");
    }
    expect(ompDocLink("no-such-concept")).toBeNull();
  });

  test("OMP_DOCS and the key map agree on anchors", () => {
    // Every key-map entry must also appear in the curated list, so adding a
    // concept forces a decision about its public placement.
    for (const key of [
      "advisor",
      "agents",
      "disabledProviders",
      "extensions",
      "fallbackChains",
      "hooks",
      "mcp",
      "memory",
      "models",
      "modelRoles",
      "precedence",
      "providers",
      "settings",
    ] as const) {
      const link = ompDocLink(key);
      expect(
        OMP_DOCS.some((entry) => entry.href === link?.href),
        `no OMP_DOCS entry for ${key} (${link?.href})`
      ).toBe(true);
    }
  });
});

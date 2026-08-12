import { describe, expect, test } from "bun:test";

import { applyBump, deriveBump, parseCommit } from "./release.ts";

const commit = (subject: string, body = "") =>
  parseCommit("0123456789abcdef", subject, body);

describe("parseCommit", () => {
  test("reads the conventional type", () => {
    expect(commit("feat(cli): add a flag").type).toBe("feat");
    expect(commit("fix: stop crashing").type).toBe("fix");
  });

  test("treats a non-conventional subject as untyped rather than throwing", () => {
    expect(commit("merge branch main").type).toBe("");
  });

  test("detects the bang marker", () => {
    expect(commit("feat(api)!: drop the alias").breaking).toBe(true);
    expect(commit("feat(api): keep the alias").breaking).toBe(false);
  });

  test("detects a breaking footer, which carries no bang", () => {
    expect(
      commit("refactor: reshape output", "BREAKING CHANGE: renamed field")
        .breaking
    ).toBe(true);
    // The hyphenated spelling is equally valid per the specification.
    expect(
      commit("refactor: reshape", "BREAKING-CHANGE: renamed").breaking
    ).toBe(true);
  });

  test("does not mistake a mention of breaking changes for a footer", () => {
    expect(commit("docs: explain BREAKING CHANGE handling").breaking).toBe(
      false
    );
  });
});

describe("deriveBump", () => {
  test("nothing to release when there are no commits", () => {
    expect(deriveBump([], 0)).toBe("none");
  });

  test("housekeeping alone is not a release", () => {
    const commits = [
      commit("chore: bump deps"),
      commit("docs: fix a typo"),
      commit("ci: add a gate"),
    ];
    expect(deriveBump(commits, 0)).toBe("none");
  });

  test("a feature is a minor", () => {
    expect(deriveBump([commit("feat: add search")], 1)).toBe("minor");
  });

  test("a fix or a perf change is a patch", () => {
    expect(deriveBump([commit("fix: handle 404")], 1)).toBe("patch");
    expect(deriveBump([commit("perf: cache lookups")], 1)).toBe("patch");
  });

  test("the largest bump present wins regardless of order", () => {
    const commits = [commit("fix: a"), commit("feat: b"), commit("chore: c")];
    expect(deriveBump(commits, 1)).toBe("minor");
  });

  test("a breaking change is a major once stable", () => {
    expect(deriveBump([commit("feat!: reshape")], 1)).toBe("major");
  });

  test("a breaking change below 1.0 is a minor, not a claim of stability", () => {
    expect(deriveBump([commit("feat!: reshape")], 0)).toBe("minor");
  });
});

describe("applyBump", () => {
  test("raises the right component and zeroes the ones below it", () => {
    expect(applyBump("0.1.1", "patch")).toBe("0.1.2");
    expect(applyBump("0.1.1", "minor")).toBe("0.2.0");
    expect(applyBump("1.2.3", "major")).toBe("2.0.0");
  });

  test("none leaves the version untouched", () => {
    expect(applyBump("0.1.1", "none")).toBe("0.1.1");
  });

  test("rejects anything that is not a plain three-part version", () => {
    expect(() => applyBump("0.1", "patch")).toThrow("plain semver");
    expect(() => applyBump("0.1.1-beta.1", "patch")).toThrow("plain semver");
    expect(() => applyBump("v0.1.1", "patch")).toThrow("plain semver");
  });
});

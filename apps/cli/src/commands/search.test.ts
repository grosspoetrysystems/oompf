import { describe, expect, test } from "bun:test";
import type { CliDeps } from "../deps.ts";
import {
  apiFetch,
  compactProfile,
  GIST_HTML,
  jsonResponse,
  PROFILE_ID,
  runCli,
  STEM,
} from "../test-helpers.ts";

function searchDeps(overrides: Partial<CliDeps> = {}): CliDeps {
  return { httpFetch: apiFetch(), ...overrides };
}

describe("search", () => {
  test("renders compact JSON records", async () => {
    const deps = searchDeps({
      httpFetch: apiFetch({
        search: jsonResponse(200, {
          query: "anthropic",
          results: [compactProfile()],
        }),
      }),
    });
    const { out, code } = await runCli(deps, ["search", "anthropic", "--json"]);
    const result = JSON.parse(out);
    expect(code).toBeUndefined();
    expect(result.query).toBe("anthropic");
    expect(result.count).toBe(1);
    expect(result.results[0].id).toBe(PROFILE_ID);
    expect(result.results[0].name).toBe(STEM);
    expect(result.results[0].source).toBe(GIST_HTML);
  });

  test("renders human output with the matched name", async () => {
    const deps = searchDeps({
      httpFetch: apiFetch({
        search: jsonResponse(200, {
          query: "anthropic",
          results: [compactProfile()],
        }),
      }),
    });
    const { out, code } = await runCli(deps, ["search", "anthropic"]);
    expect(code).toBeUndefined();
    expect(out).toContain(STEM);
  });

  test("an empty query lists the indexed profiles", async () => {
    const deps = searchDeps({
      httpFetch: apiFetch({
        search: jsonResponse(200, {
          query: "",
          results: [compactProfile()],
        }),
      }),
    });
    const { out, code } = await runCli(deps, ["search", "--json"]);
    expect(code).toBeUndefined();
    const result = JSON.parse(out);
    expect(result.query).toBe("");
    expect(result.count).toBe(1);
    expect(result.results[0].name).toBe(STEM);
  });

  test("maps a search API error to a nonzero exit", async () => {
    const deps = searchDeps({
      httpFetch: apiFetch({
        search: jsonResponse(500, {
          error: { code: "internal_error", message: "boom" },
        }),
      }),
    });
    const { out, code } = await runCli(deps, ["search", "x"]);
    expect(code).toBeGreaterThan(0);
    expect(out).toContain("internal_error");
  });
});

import { describe, expect, test } from "bun:test";
import type { CliDeps, HttpFetch } from "../deps.ts";
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
          nextCursor: null,
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
    expect(result.nextCursor).toBeNull();
    expect(result.results[0].id).toBe(PROFILE_ID);
    expect(result.results[0].name).toBe(STEM);
    expect(result.results[0].source).toBe(GIST_HTML);
  });

  test("forwards --cursor and surfaces nextCursor", async () => {
    const seen: string[] = [];
    const fetchImpl = (async (url: string) => {
      seen.push(url);
      return jsonResponse(200, {
        nextCursor: "nEXt_CuRs0r",
        query: "",
        results: [compactProfile()],
      });
    }) as HttpFetch;
    const { out, code } = await runCli(searchDeps({ httpFetch: fetchImpl }), [
      "search",
      "--cursor",
      "nEXt_CuRs0r",
      "--json",
    ]);
    expect(code).toBeUndefined();
    expect(seen.some((u) => u.includes("cursor=nEXt_CuRs0r"))).toBe(true);
    const result = JSON.parse(out);
    expect(result.nextCursor).toBe("nEXt_CuRs0r");
  });

  test("renders human output with the matched name", async () => {
    const deps = searchDeps({
      httpFetch: apiFetch({
        search: jsonResponse(200, {
          nextCursor: null,
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
          nextCursor: null,
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

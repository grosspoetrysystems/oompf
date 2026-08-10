import { describe, expect, test } from "bun:test";
import type { CliDeps } from "../deps.ts";
import {
  apiFetch,
  GIST_HTML,
  gistFetch,
  jsonResponse,
  OOMPF_URL,
  REVISION,
  runCli,
  STEM,
} from "../test-helpers.ts";

function inspectDeps(overrides: Partial<CliDeps> = {}): CliDeps {
  return {
    gistFetch: gistFetch(),
    httpFetch: apiFetch(),
    ...overrides,
  };
}

describe("inspect", () => {
  test("prints metadata for a Gist ref without artifact content", async () => {
    const { out, code } = await runCli(inspectDeps(), [
      "inspect",
      GIST_HTML,
      "--json",
    ]);
    const result = JSON.parse(out);
    expect(code).toBeUndefined();
    expect(result.sourceType).toBe("gist");
    expect(result.source).toBe(GIST_HTML);
    expect(result.name).toBe(STEM);
    expect(result.owner).toBe("octocat");
    expect(result.revision).toBe(REVISION);
    expect(result.ompVersion).toBeNull();
    expect(result.structural).toBe("valid");
    expect(result.models).toContain("anthropic/claude-x");
    // Metadata only — the raw YAML body is never emitted.
    expect(out).not.toContain("symbolPreset");
  });

  test("answers an OOMPF ref from the index metadata", async () => {
    const { out, code } = await runCli(inspectDeps(), [
      "inspect",
      OOMPF_URL,
      "--json",
    ]);
    const result = JSON.parse(out);
    expect(code).toBeUndefined();
    expect(result.sourceType).toBe("oompf");
    expect(result.source).toBe(GIST_HTML);
    expect(result.name).toBe(STEM);
    expect(result.ompVersion).toBe("7");
    expect(result.installCommand).toBe(`oompf add ${OOMPF_URL}`);
  });

  test("maps a metadata API 404 to a nonzero exit", async () => {
    const deps = inspectDeps({
      httpFetch: apiFetch({
        metadata: jsonResponse(404, {
          error: { code: "not_found", message: "No indexed profile" },
        }),
      }),
    });
    const { out, code } = await runCli(deps, ["inspect", OOMPF_URL]);
    expect(code).toBeGreaterThan(0);
    expect(out).toContain("not_found");
  });
});

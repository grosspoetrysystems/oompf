import { describe, expect, test } from "bun:test";

import { apiFetch, runCli } from "../test-helpers.ts";

describe("cli registration", () => {
  test("registers all four commands in help output", async () => {
    const { out } = await runCli({ httpFetch: apiFetch() }, ["--help"]);
    for (const command of ["publish", "add", "inspect", "search"]) {
      expect(out).toContain(command);
    }
  });

  test("reports the CLI version", async () => {
    const { out } = await runCli({}, ["--version"]);
    expect(out).toContain("0.0.0");
  });

  test("rejects an unknown command with a nonzero exit", async () => {
    const { code } = await runCli({ httpFetch: apiFetch() }, ["bogus"]);
    expect(code).toBeGreaterThan(0);
  });

  test("typed validation rejects an unknown option", async () => {
    const { code } = await runCli({ httpFetch: apiFetch() }, [
      "search",
      "--nope",
    ]);
    expect(code).toBeGreaterThan(0);
  });
});

import { describe, expect, test } from "bun:test";

import { spawnCapture } from "./spawn.ts";

/**
 * The workspace's only process-spawning path, and previously untested: `gh`
 * helper tests inject fakes, and `omp` resolution reached for the `Bun` global,
 * which silently broke the published CLI under Node. These tests drive it
 * against ordinary system binaries, so they assert runtime parity too.
 */
describe("spawnCapture", () => {
  test("captures stdout and a zero exit code", async () => {
    const result = await spawnCapture({
      args: ["hello"],
      command: "echo",
    });
    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe("hello");
    expect(result.stderr).toBe("");
  });

  test("captures stderr and a non-zero exit code without rejecting", async () => {
    const result = await spawnCapture({
      args: ["-c", "printf oops >&2; exit 3"],
      command: "sh",
    });
    expect(result.exitCode).toBe(3);
    expect(result.stderr).toBe("oops");
  });

  test("pipes stdin to the child process", async () => {
    const result = await spawnCapture({
      args: [],
      command: "cat",
      stdin: "piped payload",
    });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe("piped payload");
  });

  test("passes arguments verbatim rather than through a shell", async () => {
    // A shell would expand the glob and split on the space; argv must not.
    const result = await spawnCapture({
      args: ["*", "two words"],
      command: "echo",
    });
    expect(result.stdout.trim()).toBe("* two words");
  });

  test("rejects when the executable is missing, rather than reporting an exit code", async () => {
    // Callers distinguish "gh is not installed" from "gh ran and failed", so a
    // missing binary must reject with ENOENT and never resolve.
    const attempt = spawnCapture({
      args: [],
      command: "oompf-no-such-executable",
    });
    await expect(attempt).rejects.toMatchObject({ code: "ENOENT" });
  });
});

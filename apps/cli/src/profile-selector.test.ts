import { describe, expect, test } from "bun:test";
import { isInteractiveProfileSession } from "./profile-selector.ts";

describe("isInteractiveProfileSession", () => {
  test("allows a TTY session outside CI", () => {
    expect(
      isInteractiveProfileSession({
        ci: undefined,
        stdinIsTTY: true,
        stdoutIsTTY: true,
      })
    ).toBe(true);
  });

  test.each([
    { ci: "1", stdinIsTTY: true, stdoutIsTTY: true },
    { ci: undefined, stdinIsTTY: false, stdoutIsTTY: true },
    { ci: undefined, stdinIsTTY: true, stdoutIsTTY: false },
  ])("rejects noninteractive session %o", (options) => {
    expect(isInteractiveProfileSession(options)).toBe(false);
  });
});

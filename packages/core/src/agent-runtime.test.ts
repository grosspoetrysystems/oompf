import { describe, expect, test } from "bun:test";

import {
  AgentRuntimeUnavailableError,
  defaultProbe,
  resolveAgentRuntime,
} from "./agent-runtime.ts";

/** A probe seam keyed by runtime name, defaulting everything to absent. */
function probeFor(binary: Record<string, boolean> = {}) {
  return async (command: string) => binary[command] === true;
}

describe("resolveAgentRuntime", () => {
  test("selects omp when it is the sole installed runtime", async () => {
    const selection = await resolveAgentRuntime({
      probe: probeFor({ omp: true }),
    });
    expect(selection).toEqual({ command: "omp", runtime: "omp" });
  });

  test("selects pi when it is the sole installed runtime", async () => {
    const selection = await resolveAgentRuntime({
      probe: probeFor({ pi: true }),
    });
    expect(selection).toEqual({ command: "pi", runtime: "pi" });
  });

  test("prefers omp when both runtimes are installed", async () => {
    const selection = await resolveAgentRuntime({
      probe: probeFor({ omp: true, pi: true }),
    });
    expect(selection).toEqual({ command: "omp", runtime: "omp" });
  });

  test("throws actionably when neither runtime is installed", async () => {
    const attempt = resolveAgentRuntime({ probe: probeFor() });
    await expect(attempt).rejects.toBeInstanceOf(AgentRuntimeUnavailableError);
    await expect(attempt).rejects.toThrow(/omp or pi/);
  });

  test("returns pi when explicitly requested and present", async () => {
    const selection = await resolveAgentRuntime({
      probe: probeFor({ pi: true }),
      requested: "pi",
    });
    expect(selection).toEqual({ command: "pi", runtime: "pi" });
  });

  test("throws naming pi when explicitly requested but absent", async () => {
    const names: string[] = [];
    const probe = async (command: string) => {
      names.push(command);
      return false;
    };
    const attempt = resolveAgentRuntime({ probe, requested: "pi" });
    await expect(attempt).rejects.toBeInstanceOf(AgentRuntimeUnavailableError);
    await expect(attempt).rejects.toThrow(/pi/);
    // Only the requested runtime is probed.
    expect(names).toEqual(["pi"]);
  });

  test("default probe never throws for a missing binary", async () => {
    // The default probe runs `<command> --version`; a guaranteed-absent
    // command name must map to `false` (ENOENT swallowed), mirroring
    // spawn.test.ts:52-56 which asserts the underlying spawn rejects.
    await expect(defaultProbe("oompf-no-such-runtime")).resolves.toBe(false);
  });
});

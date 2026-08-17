/**
 * Agent-runtime detection and selection.
 *
 * OOMPF commands ask the local `omp` binary for profile paths. That binary is
 * one of two agent runtimes — `omp` (OMP) or `pi` (Programmable Intelligence).
 * This module resolves which binary a command should invoke: the installed
 * runtime, the sole installed one, or an explicit `--agent` request.
 *
 * It selects the *binary* only. `pi`'s profile-path layout compatibility is
 * tracked upstream (GPS-148) and is deliberately out of scope here — the
 * chosen command simply flows through the existing `ompCommand` seam.
 */

import { spawnCapture } from "./spawn.ts";

/** The agent runtimes OOMPF knows how to drive. */
export type AgentRuntime = "omp" | "pi";

/** The executable name for each agent runtime. */
const AGENT_RUNTIME_COMMANDS: Record<AgentRuntime, string> = {
  omp: "omp",
  pi: "pi",
};

/** A resolved runtime: the binary to invoke plus which runtime it is. */
export interface AgentRuntimeSelection {
  readonly command: string;
  readonly runtime: AgentRuntime;
}

/** Options controlling {@link resolveAgentRuntime}. */
export interface AgentRuntimeOptions {
  /**
   * Probe seam; defaults to running `<command> --version` and treating any
   * result as "present". Tests inject a fake so no real binary is touched.
   */
  readonly probe?: (command: string) => Promise<boolean>;
  /** The runtime the caller explicitly requested via `--agent`. */
  readonly requested?: AgentRuntime;
}

/** No usable agent runtime is installed (or the requested one is absent). */
export class AgentRuntimeUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AgentRuntimeUnavailableError";
  }
}

/** Default probe: the binary exists when `--version` runs at all. */
export async function defaultProbe(command: string): Promise<boolean> {
  try {
    await spawnCapture({ args: ["--version"], command });
    return true;
  } catch {
    return false;
  }
}

const INSTALL_BOTH = `Install either ${AGENT_RUNTIME_COMMANDS.omp} or ${AGENT_RUNTIME_COMMANDS.pi} and retry.`;

/**
 * Resolve which agent-runtime binary a command should drive.
 *
 * Precedence:
 * 1. `requested` set -> probe only that runtime. Present -> return it;
 *    absent -> throw {@link AgentRuntimeUnavailableError}.
 * 2. `requested` unset -> probe both concurrently. Both present -> `omp`;
 *    exactly one -> that one; neither -> throw
 *    {@link AgentRuntimeUnavailableError}.
 */
export async function resolveAgentRuntime(
  options?: AgentRuntimeOptions
): Promise<AgentRuntimeSelection> {
  const probe = options?.probe ?? defaultProbe;

  if (options?.requested !== undefined) {
    const requested = options.requested;
    if (await probe(AGENT_RUNTIME_COMMANDS[requested])) {
      return { command: AGENT_RUNTIME_COMMANDS[requested], runtime: requested };
    }
    throw new AgentRuntimeUnavailableError(
      `The ${requested} agent runtime is not installed (expected the ${AGENT_RUNTIME_COMMANDS[requested]} binary on PATH). ${INSTALL_BOTH}`
    );
  }

  const [ompPresent, piPresent] = await Promise.all([
    probe(AGENT_RUNTIME_COMMANDS.omp),
    probe(AGENT_RUNTIME_COMMANDS.pi),
  ]);

  if (ompPresent) {
    return { command: AGENT_RUNTIME_COMMANDS.omp, runtime: "omp" };
  }
  if (piPresent) {
    return { command: AGENT_RUNTIME_COMMANDS.pi, runtime: "pi" };
  }
  throw new AgentRuntimeUnavailableError(
    `No agent runtime is installed (expected ${AGENT_RUNTIME_COMMANDS.omp} or ${AGENT_RUNTIME_COMMANDS.pi} on PATH). ${INSTALL_BOTH}`
  );
}

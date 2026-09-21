import { isCancel, select } from "@clack/prompts";

export interface ProfileSelector {
  isInteractive(): boolean;
  selectProfile(names: readonly string[]): Promise<string | null>;
}

interface InteractiveSessionOptions {
  readonly ci: string | undefined;
  readonly stdinIsTTY: boolean | undefined;
  readonly stdoutIsTTY: boolean | undefined;
}

export function isInteractiveProfileSession(
  options: InteractiveSessionOptions
): boolean {
  return (
    options.ci === undefined &&
    options.stdinIsTTY === true &&
    options.stdoutIsTTY === true
  );
}

export const defaultProfileSelector: ProfileSelector = {
  isInteractive: () =>
    isInteractiveProfileSession({
      ci: process.env.CI,
      stdinIsTTY: process.stdin.isTTY,
      stdoutIsTTY: process.stdout.isTTY,
    }),
  selectProfile: async (names) => {
    const selected = await select<string>({
      message: "Select a profile to publish",
      options: names.map((name) => ({ label: name, value: name })),
    });
    return isCancel(selected) ? null : selected;
  },
};

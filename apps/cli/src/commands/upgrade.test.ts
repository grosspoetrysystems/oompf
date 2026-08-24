import { describe, expect, test } from "bun:test";
import type { CommandInput, CommandResult, GistFetch } from "@oompf/github";

import type { CliDeps } from "../deps.ts";
import {
  apiFetch,
  GIST_HTML,
  GIST_ID,
  jsonResponse,
  OOMPF_URL,
  profileRecord,
  REVISION,
  runCli,
} from "../test-helpers.ts";

const CURRENT_REVISION = "d".repeat(40);
const CURRENT_YAML = `name: work
modelRoles:
  planner: anthropic/claude-opus-4:high
newAuthorField: keep-me
`;

function upgradeDeps(
  overrides: Partial<CliDeps> = {},
  currentYaml = CURRENT_YAML
): CliDeps & { calls: CommandInput[] } {
  const calls: CommandInput[] = [];
  const runner = async (input: CommandInput): Promise<CommandResult> => {
    calls.push(input);
    if (input.args[0] === "api" && input.args[1] === "user") {
      return {
        exitCode: 0,
        stderr: "",
        stdout: JSON.stringify({ login: "octocat" }),
      };
    }
    if (input.args[0] === "api" && input.args[1] === "--method") {
      return {
        exitCode: 0,
        stderr: "",
        stdout: JSON.stringify({
          history: [{ version: "e".repeat(40) }],
          html_url: GIST_HTML,
          id: GIST_ID,
        }),
      };
    }
    throw new Error(`unexpected command: ${input.args.join(" ")}`);
  };
  const gistFetch: GistFetch = async () => ({
    ok: true,
    status: 200,
    text: async () =>
      JSON.stringify({
        files: {
          "work.yml": {
            content: currentYaml,
            filename: "work.yml",
            raw_url: null,
          },
        },
        history: [{ version: CURRENT_REVISION }],
        html_url: GIST_HTML,
        id: GIST_ID,
        owner: { login: "octocat" },
      }),
  });
  const metadata = profileRecord();
  return {
    calls,
    gistFetch,
    httpFetch: apiFetch({
      metadata: jsonResponse(200, {
        ...metadata,
        revision: REVISION,
        sourceUrl: GIST_HTML,
      }),
      register: (body) => {
        const parsed = JSON.parse(body) as { source?: string };
        expect(parsed.source).toBe(GIST_HTML);
        return jsonResponse(200, {
          id: "prof_0123456789abcdef0123456789abcdef",
          source: GIST_HTML,
          url: "/p/prof_0123456789abcdef0123456789abcdef",
          validation: {
            errors: [],
            level: "structural",
            structural: "valid",
            warnings: [],
          },
        });
      },
    }),
    runner,
    ...overrides,
  };
}

describe("upgrade", () => {
  test("previews the current head without writing", async () => {
    const deps = upgradeDeps();
    const { code, out } = await runCli(deps, ["upgrade", OOMPF_URL, "--json"]);
    const result = JSON.parse(out) as {
      changes: Array<{ from: string; to: string }>;
      currentRevision: string;
      updatedRevision: string | null;
    };

    expect(code).toBeUndefined();
    expect(result.currentRevision).toBe(CURRENT_REVISION);
    expect(result.changes).toHaveLength(1);
    expect(result.changes[0]).toMatchObject({
      from: "anthropic/claude-opus-4:high",
      to: "anthropic/claude-opus-4-8:high",
    });
    expect(result.updatedRevision).toBeNull();
    expect(deps.calls).toEqual([]);
  });

  test("confirmation patches the current head and re-registers the same source", async () => {
    const deps = upgradeDeps();
    const { code, out } = await runCli(deps, [
      "upgrade",
      OOMPF_URL,
      "--yes",
      "--json",
    ]);
    const result = JSON.parse(out) as {
      oompfUrl: string;
      updatedRevision: string | null;
    };
    const patch = deps.calls.find((call) => call.args[1] === "--method");

    expect(code).toBeUndefined();
    expect(result.oompfUrl).toBe(OOMPF_URL);
    expect(result.updatedRevision).toBe("e".repeat(40));
    expect(patch?.stdin).toContain("keep-me");
    expect(patch?.stdin).toContain("claude-opus-4-8:high");
  });

  test("noninteractive mode previews without writing", async () => {
    const deps = upgradeDeps();
    const { code } = await runCli(deps, ["upgrade", OOMPF_URL]);

    expect(code).toBeUndefined();
    expect(deps.calls).toEqual([]);
  });

  test("an already-current profile is a no-op even with confirmation", async () => {
    const current = CURRENT_YAML.replace(
      "anthropic/claude-opus-4:high",
      "anthropic/claude-opus-4-8:high"
    );
    const deps = upgradeDeps({}, current);
    const { code, out } = await runCli(deps, [
      "upgrade",
      OOMPF_URL,
      "--yes",
      "--json",
    ]);
    const result = JSON.parse(out) as {
      changes: readonly unknown[];
      updatedRevision: string | null;
    };

    expect(code).toBeUndefined();
    expect(result.changes).toEqual([]);
    expect(result.updatedRevision).toBeNull();
    expect(deps.calls).toEqual([]);
  });
});

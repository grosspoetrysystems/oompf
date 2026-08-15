import { describe, expect, test } from "bun:test";

import {
  type CommandInput,
  type CommandResult,
  type CommandRunner,
  createPublicProfileGist,
  getGithubIdentity,
} from "./gh.ts";

const GIST_ID = "a".repeat(32);
const GIST_URL = `https://gist.github.com/octocat/${GIST_ID}`;

/** Build a command runner that records its calls and returns `result`. */
function stubRunner(result: CommandResult): {
  runner: CommandRunner;
  calls: CommandInput[];
} {
  const calls: CommandInput[] = [];
  const runner: CommandRunner = async (input) => {
    calls.push(input);
    return result;
  };
  return { calls, runner };
}

/** A runner that rejects with an ENOENT-coded error, as spawn does. */
const missingGhRunner: CommandRunner = async () => {
  const error = new Error("spawn gh ENOENT") as Error & { code: string };
  error.code = "ENOENT";
  throw error;
};

/** A runner whose error only *mentions* ENOENT (no `code` property). */
const missingGhMessageRunner: CommandRunner = async () => {
  throw new Error("spawn gh ENOENT: no such file or directory");
};

const INPUT = {
  content: "models:\n  default: gpt\n",
  description: "OOMPF profile my-profile",
  filename: "my-profile.yml",
};

describe("getGithubIdentity", () => {
  test("returns the authenticated login from `gh api user`", async () => {
    const { runner, calls } = stubRunner({
      exitCode: 0,
      stderr: "",
      stdout: JSON.stringify({ id: 1, login: "octocat" }),
    });

    await expect(getGithubIdentity({ runner })).resolves.toEqual({
      login: "octocat",
    });

    expect(calls).toHaveLength(1);
    expect(calls[0]).toEqual({ args: ["api", "user"], command: "gh" });
  });

  test("uses the configured ghCommand and names it in install guidance", async () => {
    const error = await getGithubIdentity({
      ghCommand: "ghc",
      runner: missingGhRunner,
    }).catch((e: unknown) => e);
    const message = (error as Error).message;
    expect(message).toContain("(`ghc`)");
    expect(message).toMatch(/was not found on your PATH/);
    expect(message).toMatch(/https:\/\/cli\.github\.com\/.*gh auth login/);
  });

  test("gives actionable auth guidance with gh's own diagnostics on non-zero exit", async () => {
    const { runner } = stubRunner({
      exitCode: 1,
      stderr: "gh: To get started with GitHub CLI, please run: gh auth login",
      stdout: "",
    });

    const error = await getGithubIdentity({ runner }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(Error);
    const message = (error as Error).message;
    expect(message).toMatch(/could not read your account/);
    expect(message).toMatch(/gh auth login/);
    // gh's own diagnostic is surfaced so the user can act on it.
    expect(message).toContain("To get started with GitHub CLI");
  });

  test("gives install guidance when gh is missing (ENOENT code)", async () => {
    const error = await getGithubIdentity({ runner: missingGhRunner }).catch(
      (e: unknown) => e
    );
    expect((error as Error).message).toMatch(/was not found on your PATH/);
    expect((error as Error).message).toMatch(/gh auth login/);
  });

  test("gives install guidance when gh is missing (ENOENT in message only)", async () => {
    await expect(
      getGithubIdentity({ runner: missingGhMessageRunner })
    ).rejects.toThrow(/was not found on your PATH/);
  });

  test("rethrows non-ENOENT runner failures unchanged", async () => {
    const failingRunner: CommandRunner = async () => {
      throw new Error("boom");
    };
    await expect(getGithubIdentity({ runner: failingRunner })).rejects.toThrow(
      "boom"
    );
  });

  test("rejects stdout that is not valid JSON", async () => {
    const { runner } = stubRunner({
      exitCode: 0,
      stderr: "",
      stdout: "gh: logged in as octocat",
    });
    await expect(getGithubIdentity({ runner })).rejects.toThrow(
      /was not valid JSON/
    );
  });

  test("rejects a valid JSON response without a login", async () => {
    const { runner } = stubRunner({
      exitCode: 0,
      stderr: "",
      stdout: JSON.stringify({ id: 1 }),
    });
    await expect(getGithubIdentity({ runner })).rejects.toThrow(
      /did not include a login.*gh auth login/
    );
  });
});

describe("createPublicProfileGist", () => {
  test("publishes via gh and parses the reported Gist URL", async () => {
    const { runner, calls } = stubRunner({
      exitCode: 0,
      stderr: "",
      stdout: `${GIST_URL}\n`,
    });

    await expect(createPublicProfileGist(INPUT, { runner })).resolves.toEqual({
      gistId: GIST_ID,
      htmlUrl: GIST_URL,
      url: `https://api.github.com/gists/${GIST_ID}`,
    });

    expect(calls).toHaveLength(1);
    // Exact argv contract: literal args, content over stdin, public only.
    expect(calls[0]).toEqual({
      args: [
        "gist",
        "create",
        "--public",
        "--filename",
        INPUT.filename,
        "--desc",
        INPUT.description,
        "-",
      ],
      command: "gh",
      stdin: INPUT.content,
    });
  });

  test("strips a bare Gist URL without an owner segment", async () => {
    const { runner } = stubRunner({
      exitCode: 0,
      stderr: "",
      stdout: `https://gist.github.com/${GIST_ID}\n`,
    });
    await expect(createPublicProfileGist(INPUT, { runner })).resolves.toEqual({
      gistId: GIST_ID,
      htmlUrl: `https://gist.github.com/${GIST_ID}`,
      url: `https://api.github.com/gists/${GIST_ID}`,
    });
  });

  test("strips trailing punctuation ) . , ] from the reported URL", async () => {
    const { runner } = stubRunner({
      exitCode: 0,
      stderr: "",
      // URL embedded in prose with every trailing-punctuation variant.
      stdout: `created: ${GIST_URL}).,]`,
    });
    await expect(
      createPublicProfileGist(INPUT, { runner })
    ).resolves.toMatchObject({ gistId: GIST_ID, htmlUrl: GIST_URL });
  });

  test("gives actionable guidance when gh is missing", async () => {
    const error = await createPublicProfileGist(INPUT, {
      runner: missingGhRunner,
    }).catch((e: unknown) => e);
    const message = (error as Error).message;
    expect(message).toMatch(/was not found on your PATH/);
    expect(message).toMatch(/cli\.github\.com/);
    expect(message).toMatch(/gh auth login/);
  });

  test("surfaces gh's stderr, and nothing of the input, on non-zero exit", async () => {
    const { runner } = stubRunner({
      exitCode: 1,
      stderr: "HTTP 422: Validation Failed",
      stdout: "",
    });
    const error = await createPublicProfileGist(INPUT, { runner }).catch(
      (e: unknown) => e
    );
    const message = (error as Error).message;
    expect(message).toMatch(/failed to create the public Gist/);
    expect(message).toContain("HTTP 422: Validation Failed");
    // Value-free: content, filename, and description never leak into errors.
    expect(message).not.toContain(INPUT.content);
    expect(message).not.toContain(INPUT.filename);
    expect(message).not.toContain(INPUT.description);
  });

  test("errors actionably when gh prints no parseable Gist URL", async () => {
    const { runner } = stubRunner({
      exitCode: 0,
      stderr: "",
      stdout: "Creating gist...\n",
    });
    const error = await createPublicProfileGist(INPUT, { runner }).catch(
      (e: unknown) => e
    );
    const message = (error as Error).message;
    expect(message).toMatch(/did not report a Gist URL/);
    // The unexpected output is echoed so the user can diagnose.
    expect(message).toContain("Creating gist...");
    // Value-free: the piped content never leaks into errors.
    expect(message).not.toContain(INPUT.content);
  });
});

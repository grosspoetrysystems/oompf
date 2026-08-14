import { describe, expect, test } from "bun:test";

import { DEFAULT_MAX_BYTES, sha256 } from "@oompf/core";

import {
  type CommandInput,
  type CommandResult,
  type CommandRunner,
  createPublicProfileGist,
  getGithubIdentity,
} from "./gh.ts";
import {
  fetchPublicGist,
  type GistFetch,
  type GistFetchResponse,
  normalizeGistUrl,
  parseGistLocation,
} from "./gists.ts";

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

/** A runner that rejects as though the executable were missing. */
const missingGhRunner: CommandRunner = async () => {
  const error = new Error("spawn gh ENOENT") as Error & { code: string };
  error.code = "ENOENT";
  throw error;
};

/** Build a structural fetch response. */
function jsonResponse(status: number, body: unknown): GistFetchResponse {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => (typeof body === "string" ? body : JSON.stringify(body)),
  };
}

describe("getGithubIdentity", () => {
  test("returns the authenticated login", async () => {
    const { runner, calls } = stubRunner({
      exitCode: 0,
      stderr: "",
      stdout: JSON.stringify({ id: 1, login: "octocat" }),
    });
    const identity = await getGithubIdentity({ runner });
    expect(identity).toEqual({ login: "octocat" });
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ args: ["api", "user"], command: "gh" });
  });

  test("gives an actionable error when gh is not installed", async () => {
    await expect(
      getGithubIdentity({ runner: missingGhRunner })
    ).rejects.toThrow(/was not found on your PATH/);
  });

  test("gives an actionable auth error on non-zero exit", async () => {
    const { runner } = stubRunner({
      exitCode: 1,
      stderr: "gh: To get started with GitHub CLI, please run: gh auth login",
      stdout: "",
    });
    await expect(getGithubIdentity({ runner })).rejects.toThrow(
      /gh auth login/
    );
  });

  test("rejects a response missing a login", async () => {
    const { runner } = stubRunner({
      exitCode: 0,
      stderr: "",
      stdout: JSON.stringify({ id: 1 }),
    });
    await expect(getGithubIdentity({ runner })).rejects.toThrow(
      /did not include a login/
    );
  });
});

describe("createPublicProfileGist", () => {
  test("invokes gh with --public, the given filename, and stdin content", async () => {
    const { runner, calls } = stubRunner({
      exitCode: 0,
      stderr: "",
      stdout:
        "https://gist.github.com/octocat/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\n",
    });
    const result = await createPublicProfileGist(
      {
        content: "models:\n  default: gpt\n",
        description: "OOMPF profile my-profile",
        filename: "my-profile.yml",
      },
      { runner }
    );

    expect(result).toEqual({
      gistId: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      htmlUrl:
        "https://gist.github.com/octocat/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      url: "https://api.github.com/gists/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    });

    expect(calls).toHaveLength(1);
    const call = calls[0];
    expect(call?.command).toBe("gh");
    expect(call?.args).toContain("--public");
    // Never a secret gist.
    expect(call?.args).not.toContain("--secret");
    // Filename is preserved verbatim, adjacent to --filename.
    const filenameIndex = call?.args.indexOf("--filename") ?? -1;
    expect(filenameIndex).toBeGreaterThanOrEqual(0);
    expect(call?.args[filenameIndex + 1]).toBe("my-profile.yml");
    // Description is passed as an argument, not interpolated.
    const descIndex = call?.args.indexOf("--desc") ?? -1;
    expect(call?.args[descIndex + 1]).toBe("OOMPF profile my-profile");
    // Content is piped over stdin, not written to a temp file argument.
    expect(call?.stdin).toBe("models:\n  default: gpt\n");
  });

  test("surfaces non-zero exit details without a URL", async () => {
    const { runner } = stubRunner({
      exitCode: 1,
      stderr: "HTTP 422: Validation Failed",
      stdout: "",
    });
    await expect(
      createPublicProfileGist(
        { content: "a: 1", description: "d", filename: "p.yml" },
        { runner }
      )
    ).rejects.toThrow(/HTTP 422: Validation Failed/);
  });

  test("errors when gh prints no parseable Gist URL", async () => {
    const { runner } = stubRunner({
      exitCode: 0,
      stderr: "",
      stdout: "Creating gist...\n",
    });
    await expect(
      createPublicProfileGist(
        { content: "a: 1", description: "d", filename: "p.yml" },
        { runner }
      )
    ).rejects.toThrow(/did not report a Gist URL/);
  });

  test("gives an actionable error when gh is not installed", async () => {
    await expect(
      createPublicProfileGist(
        { content: "a: 1", description: "d", filename: "p.yml" },
        { runner: missingGhRunner }
      )
    ).rejects.toThrow(/was not found on your PATH/);
  });
});

describe("parseGistLocation / normalizeGistUrl", () => {
  const id = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
  const revision = "b".repeat(40);

  test("accepts a bare Gist ID", () => {
    expect(parseGistLocation(id)).toEqual({
      gistId: id,
      owner: null,
      revision: null,
    });
  });

  test("accepts gist.github.com/<owner>/<id>", () => {
    expect(parseGistLocation(`https://gist.github.com/octocat/${id}`)).toEqual({
      gistId: id,
      owner: "octocat",
      revision: null,
    });
  });

  test("accepts gist.github.com/<id> (no owner)", () => {
    expect(parseGistLocation(`https://gist.github.com/${id}`)).toEqual({
      gistId: id,
      owner: null,
      revision: null,
    });
  });

  test("accepts a pinned revision", () => {
    expect(
      parseGistLocation(`https://gist.github.com/octocat/${id}/${revision}`)
    ).toEqual({ gistId: id, owner: "octocat", revision });
  });

  test("accepts the api.github.com form", () => {
    expect(parseGistLocation(`https://api.github.com/gists/${id}`)).toEqual({
      gistId: id,
      owner: null,
      revision: null,
    });
  });

  test("normalizes every accepted form to the canonical URL", () => {
    const canonical = `https://gist.github.com/${id}`;
    expect(normalizeGistUrl(id)).toBe(canonical);
    expect(normalizeGistUrl(`https://gist.github.com/octocat/${id}`)).toBe(
      canonical
    );
    expect(
      normalizeGistUrl(`https://gist.github.com/octocat/${id}/${revision}`)
    ).toBe(canonical);
    expect(normalizeGistUrl(`https://api.github.com/gists/${id}`)).toBe(
      canonical
    );
  });

  test("rejects an empty reference", () => {
    expect(() => parseGistLocation("   ")).toThrow(/empty/);
  });

  test("rejects an unsupported host (a repo URL, not a gist)", () => {
    expect(() =>
      parseGistLocation("https://github.com/octocat/hello-world")
    ).toThrow(/Unsupported host/);
  });

  test("rejects a URL with no recognisable Gist ID", () => {
    expect(() =>
      parseGistLocation("https://gist.github.com/octocat/not-an-id")
    ).toThrow(/valid Gist ID/);
  });
});

describe("fetchPublicGist", () => {
  const id = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
  const revision = "c".repeat(40);
  const yaml = "models:\n  default: gpt-5\n";

  /** Build a fetch seam mapping URLs to responses and recording requests. */
  function stubFetch(routes: Record<string, GistFetchResponse>): {
    fetch: GistFetch;
    urls: string[];
  } {
    const urls: string[] = [];
    const fetch: GistFetch = async (url) => {
      urls.push(url);
      const response = routes[url];
      if (response === undefined) {
        throw new Error(`unexpected fetch: ${url}`);
      }
      return response;
    };
    return { fetch, urls };
  }

  test("fetches metadata then canonical raw content and hashes it", async () => {
    const rawUrl = `https://gist.githubusercontent.com/octocat/${id}/raw/profile.yml`;
    const { fetch, urls } = stubFetch({
      [`https://api.github.com/gists/${id}`]: jsonResponse(200, {
        files: {
          "profile.yml": {
            content: "stale-inline-should-not-win",
            filename: "profile.yml",
            raw_url: rawUrl,
          },
        },
        history: [{ version: revision }],
        html_url: `https://gist.github.com/octocat/${id}`,
        id,
        owner: { login: "octocat" },
      }),
      [rawUrl]: jsonResponse(200, yaml),
    });

    const result = await fetchPublicGist(`https://gist.github.com/${id}`, {
      fetch,
    });

    expect(result).toEqual({
      content: yaml,
      contentHash: sha256(yaml),
      filename: "profile.yml",
      gistId: id,
      htmlUrl: `https://gist.github.com/octocat/${id}`,
      owner: "octocat",
      revision,
    });
    // Metadata is read first, then the canonical raw URL.
    expect(urls).toEqual([`https://api.github.com/gists/${id}`, rawUrl]);
  });

  test("pins the API request to a supplied revision", async () => {
    const rawUrl = `https://gist.githubusercontent.com/octocat/${id}/raw/${revision}/profile.yml`;
    const { fetch } = stubFetch({
      [`https://api.github.com/gists/${id}/${revision}`]: jsonResponse(200, {
        files: { "profile.yml": { filename: "profile.yml", raw_url: rawUrl } },
        id,
        owner: { login: "octocat" },
      }),
      [rawUrl]: jsonResponse(200, yaml),
    });

    const result = await fetchPublicGist(
      `https://gist.github.com/octocat/${id}/${revision}`,
      { fetch }
    );
    expect(result.revision).toBe(revision);
    expect(result.contentHash).toBe(sha256(yaml));
  });

  test("falls back to inline content when no raw URL is present", async () => {
    const { fetch } = stubFetch({
      [`https://api.github.com/gists/${id}`]: jsonResponse(200, {
        files: {
          "profile.yml": {
            content: yaml,
            filename: "profile.yml",
            raw_url: null,
          },
        },
        id,
        owner: { login: "octocat" },
      }),
    });
    const result = await fetchPublicGist(id, { fetch });
    expect(result.content).toBe(yaml);
    expect(result.contentHash).toBe(sha256(yaml));
  });

  test("treats a 404 as a private/missing Gist", async () => {
    const { fetch } = stubFetch({
      [`https://api.github.com/gists/${id}`]: jsonResponse(404, {
        message: "Not Found",
      }),
    });
    await expect(fetchPublicGist(id, { fetch })).rejects.toThrow(
      /was not found.*private/
    );
  });

  test("rejects a Gist with multiple YAML candidates", async () => {
    const { fetch } = stubFetch({
      [`https://api.github.com/gists/${id}`]: jsonResponse(200, {
        files: {
          "a.yml": { content: "a: 1", filename: "a.yml", raw_url: null },
          "b.yaml": { content: "b: 2", filename: "b.yaml", raw_url: null },
        },
        id,
        owner: { login: "octocat" },
      }),
    });
    await expect(fetchPublicGist(id, { fetch })).rejects.toThrow(
      /multiple YAML files/
    );
  });

  test("rejects a Gist with no YAML file", async () => {
    const { fetch } = stubFetch({
      [`https://api.github.com/gists/${id}`]: jsonResponse(200, {
        files: {
          "README.md": { content: "hi", filename: "README.md", raw_url: null },
        },
        id,
        owner: { login: "octocat" },
      }),
    });
    await expect(fetchPublicGist(id, { fetch })).rejects.toThrow(/no YAML/);
  });

  test("rejects an unsupported profile filename", async () => {
    const { fetch } = stubFetch({
      [`https://api.github.com/gists/${id}`]: jsonResponse(200, {
        files: {
          "Invalid Name.yml": {
            content: yaml,
            filename: "Invalid Name.yml",
            raw_url: null,
          },
        },
        id,
        owner: { login: "octocat" },
      }),
    });
    await expect(fetchPublicGist(id, { fetch })).rejects.toThrow(
      /not a supported profile filename/
    );
  });

  const rawUrl = `https://gist.githubusercontent.com/octocat/${id}/raw/profile.yml`;

  /** Build a metadata response pointing the raw URL at `rawResponse`. */
  function metadata(_rawResponse: GistFetchResponse): GistFetchResponse {
    return jsonResponse(200, {
      files: { "profile.yml": { filename: "profile.yml", raw_url: rawUrl } },
      id,
      owner: { login: "octocat" },
    });
  }

  test("rejects an oversized payload via content-length without reading it", async () => {
    const rawResponse: GistFetchResponse = {
      headers: { "content-length": String(DEFAULT_MAX_BYTES + 1) },
      ok: true,
      status: 200,
      // Reading would materialize the oversized body: fail loudly if reached.
      text: () => Promise.reject(new Error("body was materialized")),
    };
    const { fetch } = stubFetch({
      [`https://api.github.com/gists/${id}`]: metadata(rawResponse),
      [rawUrl]: rawResponse,
    });

    await expect(
      fetchPublicGist(`https://gist.github.com/${id}`, { fetch })
    ).rejects.toThrow(/maximum supported artifact size/);
  });

  test("returns the same content and hash for an in-cap payload", async () => {
    const bytes = new TextEncoder().encode(yaml);
    const rawResponse: GistFetchResponse = {
      body: new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(bytes);
          controller.close();
        },
      }),
      headers: { "content-length": String(bytes.byteLength) },
      ok: true,
      status: 200,
      text: async () => yaml,
    };
    const { fetch } = stubFetch({
      [`https://api.github.com/gists/${id}`]: metadata(rawResponse),
      [rawUrl]: rawResponse,
    });

    const result = await fetchPublicGist(`https://gist.github.com/${id}`, {
      fetch,
    });
    expect(result.content).toBe(yaml);
    expect(result.contentHash).toBe(sha256(yaml));
  });

  test("aborts the stream once bytes exceed the cap without a content-length", async () => {
    let cancelled = false;
    const rawResponse: GistFetchResponse = {
      body: new ReadableStream<Uint8Array>({
        cancel() {
          cancelled = true;
        },
        start(controller) {
          // Stay open so a reader.cancel() clears the stream and the
          // underlying cancel() is invoked.
          controller.enqueue(new Uint8Array(DEFAULT_MAX_BYTES + 1));
        },
      }),
      ok: true,
      status: 200,
      text: () => Promise.reject(new Error("body was materialized")),
    };
    const { fetch } = stubFetch({
      [`https://api.github.com/gists/${id}`]: metadata(rawResponse),
      [rawUrl]: rawResponse,
    });

    await expect(
      fetchPublicGist(`https://gist.github.com/${id}`, { fetch })
    ).rejects.toThrow(/maximum supported artifact size/);
    expect(cancelled).toBe(true);
  });
});

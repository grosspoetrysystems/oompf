import { describe, expect, test } from "bun:test";

import { extractMetadata } from "./metadata.ts";

describe("extractMetadata links", () => {
  test("drops non-http(s) links with a warning and keeps http(s) links", () => {
    const { metadata, warnings } = extractMetadata({
      oompf: {
        links: [
          "javascript:alert(1)",
          "data:text/plain,x",
          "https://example.com",
        ],
      },
    });

    expect(metadata.links).toEqual([
      { label: null, url: "https://example.com" },
    ]);
    expect(warnings).toEqual([
      "oompf.links dropped an entry with a non-http(s) URL.",
      "oompf.links dropped an entry with a non-http(s) URL.",
    ]);
  });

  test("keeps an http link and a labeled link object", () => {
    const { metadata, warnings } = extractMetadata({
      oompf: {
        links: [
          "http://example.com",
          { label: "Docs", url: "https://example.com/docs" },
        ],
      },
    });

    expect(metadata.links).toEqual([
      { label: null, url: "http://example.com" },
      { label: "Docs", url: "https://example.com/docs" },
    ]);
    expect(warnings).toEqual([]);
  });
});

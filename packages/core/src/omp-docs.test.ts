import { expect, test } from "bun:test";

import { ompDocLink } from "./omp-docs.ts";

test("unknown and inherited keys return null", () => {
  for (const key of [
    "",
    "constructor",
    "toString",
    "__proto__",
    "hasOwnProperty",
    "no-such-concept",
  ]) {
    expect(ompDocLink(key), `expected no link for ${key}`).toBeNull();
  }
});

test("profile documentation addresses a Markdown file, not an extensionless path", () => {
  expect(ompDocLink("profiles")?.href).toMatch(/\/[^/]+\.md#/);
});

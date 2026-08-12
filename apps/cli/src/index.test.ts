import { expect, test } from "bun:test";
import manifest from "../package.json" with { type: "json" };
import { CLI_VERSION } from "./index.ts";

/**
 * Drift between the reported version and the published one used to be possible,
 * and this test compared the two. It cannot drift now - {@link CLI_VERSION} is
 * read from the manifest - so comparing them proves nothing.
 *
 * What remains worth asserting is the mechanism and the shape. The version
 * reaches the bundle through a JSON import that the bundler inlines: if that
 * ever stops working the constant becomes `undefined` and `oompf --version`
 * silently reports nothing. And the release flow derives a `cli-v<version>` tag
 * by incrementing three numeric components, so a prerelease or `v`-prefixed
 * version in the manifest would produce a tag that does not match the package.
 */
test("the CLI version is a plain three-part semver, resolved at build time", () => {
  expect(CLI_VERSION).toBeString();
  expect(CLI_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  expect(CLI_VERSION).toBe(manifest.version);
});

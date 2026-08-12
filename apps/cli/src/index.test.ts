import { expect, test } from "bun:test";
import manifest from "../package.json" with { type: "json" };
import { CLI_VERSION } from "./index.ts";

/**
 * `oompf --version` reports {@link CLI_VERSION}, but npm publishes whatever is
 * in `package.json`. When those drift, every bug report becomes ambiguous —
 * the reporter's version string no longer identifies the code they ran. The
 * release workflow also gates on the manifest version, so a drifted constant
 * would ship silently.
 */
test("the reported CLI version matches the published package version", () => {
  expect(CLI_VERSION).toBe(manifest.version);
});

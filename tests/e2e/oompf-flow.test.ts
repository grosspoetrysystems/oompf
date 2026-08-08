import { expect, test } from "bun:test";

import { runLocalSmoke } from "../../scripts/smoke-local.ts";

test("local fixture publishes, indexes, searches, inspects, installs, and redacts content", async () => {
  const summary = await runLocalSmoke();

  expect(summary.profileId).toMatch(/^prof_[0-9a-f]{32}$/);
  expect(summary.oompfUrl).toContain(`/p/${summary.profileId}`);
  expect(summary.installedPath).toBe("/omp/profiles/smoke-work/agent/config.yml");
  expect(summary.searchCount).toBe(1);
  expect(summary.collisionExitCode).toBeGreaterThan(0);
  expect(summary.metadataLeakChecked).toBe(true);
  expect(summary.cliLeakChecked).toBe(true);
});

import type { KnipConfig } from "knip";

/**
 * Knip runs in CI, so every ignore here is a claim that something is
 * intentionally unreferenced. Keep the list short and justified — a stale
 * ignore silently hides real dead code.
 */
const config: KnipConfig = {
  // `oompf` is the tarball installed by the distribution job, not a workspace
  // dependency; knip sees the invocation in the workflow.
  ignoreBinaries: ["oompf"],
  // `@astrojs/check` is invoked by `astro check`, `cloudflare` by Wrangler;
  // neither is imported.
  ignoreDependencies: ["@astrojs/check", "cloudflare"],
  ignoreIssues: {
    // Public contracts consumed across the CLI/web boundary or by tests: the
    // exports are the API surface, not dead code.
    "apps/cli/src/api.ts": ["exports", "types"],
    "apps/cli/src/deps.ts": ["exports"],
    "apps/cli/src/output.ts": ["exports"],
    "apps/cli/src/test-helpers.ts": ["exports"],
    "apps/web/src/lib/services/index-profile.ts": ["exports", "types"],
  },
  workspaces: {
    ".": {
      entry: ["scripts/**/*.ts", "tests/**/*.ts"],
      ignoreDependencies: ["@biomejs/biome"],
      project: ["scripts/**/*.ts", "tests/**/*.ts"],
    },
    "apps/cli": {
      project: ["src/**/*.ts"],
    },
    "apps/web": {
      entry: ["src/pages/**/*.astro"],
      project: ["src/**/*.{ts,astro}"],
    },
    "packages/core": {
      project: ["src/**/*.ts"],
    },
    "packages/database": {
      project: ["src/**/*.ts"],
    },
    "packages/github": {
      project: ["src/**/*.ts"],
    },
  },
};

export default config;

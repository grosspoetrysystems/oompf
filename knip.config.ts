import type { KnipConfig } from "knip";

const config: KnipConfig = {
  ignoreDependencies: ["@astrojs/check", "cloudflare"],
  ignoreIssues: {
    "apps/cli/src/api.ts": ["exports", "types"],
    "apps/cli/src/deps.ts": ["exports"],
    "apps/cli/src/output.ts": ["exports"],
    "apps/cli/src/test-helpers.ts": ["exports"],
    "apps/web/src/lib/services/index-profile.ts": ["exports", "types"],
  },
  ignoreUnresolved: ["cloudflare:workers"],
  workspaces: {
    ".": {
      entry: ["scripts/**/*.ts", "tests/**/*.ts"],
      ignoreDependencies: ["@biomejs/biome", "ultracite"],
      project: ["scripts/**/*.ts", "tests/**/*.ts"],
    },
    "apps/cli": {
      entry: ["src/index.ts"],
      ignoreDependencies: ["zod"],
      project: ["src/**/*.ts"],
    },
    "apps/web": {
      entry: ["src/pages/**/*.astro"],
      project: ["src/**/*.{ts,astro}"],
    },
    "packages/core": {
      entry: ["src/index.ts"],
      project: ["src/**/*.ts"],
    },
    "packages/database": {
      entry: ["src/index.ts"],
      ignoreDependencies: ["drizzle-kit"],
      project: ["src/**/*.ts"],
    },
    "packages/github": {
      entry: ["src/index.ts", "src/gists.ts"],
      project: ["src/**/*.ts"],
    },
  },
};

export default config;

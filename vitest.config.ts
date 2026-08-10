import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      exclude: [
        "**/dist/**",
        "**/.astro/**",
        "**/*.config.{js,ts}",
        "**/*.d.ts",
      ],
      provider: "v8",
      reporter: ["text", "json"],
      reportsDirectory: "coverage",
    },
    exclude: [
      "**/node_modules/**",
      "**/dist/**",
      "**/.astro/**",
      "**/*.bun.test.ts",
    ],
    include: ["tests/vitest/**/*.test.ts"],
  },
});

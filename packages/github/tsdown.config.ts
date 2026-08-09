import { defineConfig } from "tsdown";

export default defineConfig({
  clean: true,
  dts: true,
  entry: ["src/index.ts", "src/gists.ts"],
  format: ["esm"],
  sourcemap: true,
});

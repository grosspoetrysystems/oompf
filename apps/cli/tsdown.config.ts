import { defineConfig } from "tsdown";

// The CLI ships as a single self-contained bundle.
//
// `@oompf/core` and `@oompf/github` are workspace packages that are not
// published to npm — the `@oompf` scope is unowned — so they MUST be inlined
// rather than left as bare imports a consumer's installer would try, and fail,
// to resolve. `incur` and Node builtins stay external and resolve normally
// from the published dependency list.
export default defineConfig({
  clean: true,
  dts: true,
  entry: ["src/index.ts"],
  format: ["esm"],
  noExternal: [/^@oompf\//],
  sourcemap: true,
});

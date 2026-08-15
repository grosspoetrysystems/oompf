// This project is steered through Linear, so the commit scope carries the issue
// key (e.g. `fix(GPS-123): ...`) rather than the package name. The scope stays
// optional for untracked housekeeping (docs, chore, ci), but when present it must
// be a Linear key so commits link back to their ticket. The bootstrap default
// (package-name scopes) applies to repos without Linear.
const LINEAR_KEY = /^GPS-\d+$/;

export default {
  extends: ["@commitlint/config-conventional"],
  plugins: [
    {
      rules: {
        "scope-linear-key": ({ scope }) => [
          scope === null || LINEAR_KEY.test(scope),
          'scope, when present, must be a Linear issue key like "GPS-123"',
        ],
      },
    },
  ],
  rules: {
    "body-empty": [2, "always"],
    "footer-empty": [2, "always"],
    "header-max-length": [2, "always", 100],
    // Linear keys are upper-case; the custom rule above pins the exact shape.
    "scope-case": [0],
    "scope-linear-key": [2, "always"],
  },
};

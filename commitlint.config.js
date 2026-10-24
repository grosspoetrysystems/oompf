// This project is steered through Linear, so the commit scope carries the issue
// key (e.g. `fix(GPS-123): ...`) rather than the package name. The scope stays
// optional for untracked housekeeping (docs, chore, ci), but when present it must
// be a Linear key so commits link back to their ticket. The bootstrap default
// (package-name scopes) applies to repos without Linear.
const LINEAR_KEY = /^GPS-\d+$/;
// DCO trailer added by `git commit -s`: `Signed-off-by: Full Name <email>`. This
// checks the basic trailer shape only — a non-empty signer with no angle
// brackets, then an `<...@...>` address — and leaves identity matching to DCO.
const SIGN_OFF = /^Signed-off-by: [^\s<>][^<>]* <[^<>@\s]+@[^<>@\s]+>$/;

export default {
  extends: ["@commitlint/config-conventional"],
  plugins: [
    {
      rules: {
        // DCO requires every normal commit to be signed off. The only footer
        // we allow is one or more well-formed `Signed-off-by:` trailers; this
        // replaces the blanket `footer-empty` rule so sign-offs pass while
        // prose bodies (body-empty) and arbitrary footers stay rejected.
        // Author/email matching remains DCO's responsibility.
        "dco-sign-off": ({ footer }) => {
          const lines = footer ? footer.split("\n") : [];
          return [
            lines.length > 0 && lines.every((line) => SIGN_OFF.test(line)),
            "commit must carry only Signed-off-by trailer(s) — run `git commit -s` and add no body or other footer",
          ];
        },
        "scope-linear-key": ({ scope }) => [
          scope === null || LINEAR_KEY.test(scope),
          'scope, when present, must be a Linear issue key like "GPS-123"',
        ],
      },
    },
  ],
  rules: {
    "body-empty": [2, "always"],
    "dco-sign-off": [2, "always"],
    "header-max-length": [2, "always", 100],
    // Linear keys are upper-case; the custom rule above pins the exact shape.
    "scope-case": [0],
    "scope-linear-key": [2, "always"],
  },
};

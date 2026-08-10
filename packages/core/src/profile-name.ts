/**
 * OMP profile name validation.
 *
 * Mirrors the exact rules OMP enforces for `--profile <name>` so that OOMPF
 * accepts precisely the profile names OMP itself accepts, and rejects the rest
 * with an explanatory reason. Validation is total and lossless: a name is
 * either returned unchanged as `value`, or rejected. Names are never silently
 * lowercased, truncated, or otherwise rewritten.
 *
 * OMP's rule (observed from `omp --profile <name> config path`):
 *   - must match `^[a-z0-9][a-z0-9._-]{0,63}$`
 *   - cannot be `"."` or `".."`
 *   - cannot end with `"."`
 *   - cannot be a Windows reserved device name (CON, PRN, AUX, NUL, COM0-9,
 *     LPT0-9), nor any of those followed by an extension (e.g. `con.txt`).
 */

/** Successful validation result carrying the unmodified name. */
export interface ValidProfileName {
  readonly ok: true;
  readonly value: string;
}

/** Failed validation result carrying a human-readable reason. */
export interface InvalidProfileName {
  readonly ok: false;
  readonly reason: string;
}

export type ProfileNameResult = ValidProfileName | InvalidProfileName;

/** Maximum profile name length, matching OMP's `{0,63}` quantifier (+1). */
export const MAX_PROFILE_NAME_LENGTH = 64;

/**
 * Charset/shape rule. The leading class forbids a name starting with `.`, `_`,
 * or `-`; the `{0,63}` bound caps the total length at 64 characters.
 */
const PROFILE_NAME_PATTERN = /^[a-z0-9][a-z0-9._-]{0,63}$/;

/** Windows reserved device basenames, compared case-insensitively. */
const RESERVED_DEVICE_NAMES: ReadonlySet<string> = new Set([
  "CON",
  "PRN",
  "AUX",
  "NUL",
  ...Array.from({ length: 10 }, (_unused, index) => `COM${index}`),
  ...Array.from({ length: 10 }, (_unused, index) => `LPT${index}`),
]);

/**
 * Validate a profile name against OMP's rules without mutating it.
 *
 * @returns `{ ok: true, value }` with the untouched name, or `{ ok: false,
 * reason }` describing the first rule that failed.
 */
export function validateProfileName(name: string): ProfileNameResult {
  if (typeof name !== "string" || name.length === 0) {
    return { ok: false, reason: "Profile name must be a non-empty string." };
  }
  if (name.length > MAX_PROFILE_NAME_LENGTH) {
    return {
      ok: false,
      reason: `Profile name must be at most ${MAX_PROFILE_NAME_LENGTH} characters (got ${name.length}).`,
    };
  }
  if (name === "." || name === "..") {
    return { ok: false, reason: 'Profile name cannot be "." or "..".' };
  }
  if (name.endsWith(".")) {
    return { ok: false, reason: 'Profile name cannot end with ".".' };
  }
  if (!PROFILE_NAME_PATTERN.test(name)) {
    return {
      ok: false,
      reason:
        "Profile name must match ^[a-z0-9][a-z0-9._-]{0,63}$ (lowercase ASCII letters/digits plus '.', '_', '-', starting with a letter or digit).",
    };
  }
  const base = (name.split(".")[0] ?? name).toUpperCase();
  if (RESERVED_DEVICE_NAMES.has(base)) {
    return {
      ok: false,
      reason: `Profile name cannot be a Windows reserved device name (got "${name}").`,
    };
  }
  return { ok: true, value: name };
}

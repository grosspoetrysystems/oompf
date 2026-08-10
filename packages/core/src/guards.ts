/**
 * Canonical runtime type guards for `@oompf/core`.
 *
 * OMP profile documents are parsed from arbitrary YAML, so the surrounding
 * validation and facts code repeatedly needs to distinguish a mapping from a
 * scalar or sequence. This module owns the single `isRecord` guard for the
 * package; call sites import it rather than re-deriving the check.
 */

/** Narrow `value` to a plain object (mapping), excluding `null` and arrays. */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

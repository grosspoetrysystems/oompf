/**
 * Profile YAML parsing helpers.
 *
 * OMP profile configuration lives in `config.yml` / `config.yaml` files whose
 * root MUST be a mapping. These helpers parse the raw text and assert the
 * mapping-root invariant while preserving every key verbatim — no known-key
 * allow-list, no coercion, no dropping of unrecognised entries.
 */

// The runtime is Bun; `Bun` is a well-known global the ES2023 lib does not
// type, so we name the cast once (a runtime check is meaningless here).
const bunRuntime = globalThis as unknown as {
  Bun: { YAML: { parse: (input: string) => unknown } };
};
const bunYaml = bunRuntime.Bun.YAML;

/**
 * Parse YAML text into a plain JavaScript value.
 *
 * The return type is intentionally `unknown`: callers MUST narrow via
 * {@link assertProfileDocument} before treating the result as a document.
 * Parse errors from malformed YAML propagate to the caller.
 */
export function parseProfileYaml(input: string): unknown {
  return bunYaml.parse(input);
}

/**
 * Assert that a parsed YAML value is a mapping (object) root and return it as a
 * record. Unknown keys are preserved; the object is returned as-is.
 *
 * @throws TypeError when the root is not a mapping (null, array, or scalar).
 */
export function assertProfileDocument(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    const kind =
      value === null
        ? "null"
        : Array.isArray(value)
          ? "a sequence"
          : `a ${typeof value}`;
    throw new TypeError(
      `Profile YAML must have a mapping at its root, but found ${kind}.`,
    );
  }
  return value as Record<string, unknown>;
}

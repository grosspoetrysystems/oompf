/**
 * Profile YAML parsing helpers.
 *
 * OMP profile configuration lives in `config.yml` / `config.yaml` files whose
 * root MUST be a mapping. These helpers parse the raw text and assert the
 * mapping-root invariant while preserving every key verbatim — no known-key
 * allow-list, no coercion, no dropping of unrecognised entries.
 */
import { parse as parseYaml } from "yaml";

/**
 * Parse YAML text into a plain JavaScript value.
 *
 * Backed by the pure-TypeScript `yaml` package so `@oompf/core` imports and
 * runs unchanged under Bun and Cloudflare Workers (the previous `Bun.YAML`
 * dependency crashed at module load off-Bun). The return type is intentionally
 * `unknown`: callers MUST narrow via {@link assertProfileDocument} before
 * treating the result as a document. Parse errors from malformed YAML
 * propagate to the caller.
 */
export function parseProfileYaml(input: string): unknown {
  // `prettyErrors: false` keeps YAMLParseError.message free of the raw source
  // frame; the default embeds offending lines, which would leak secret values
  // through validateArtifact's error output for malformed YAML.
  return parseYaml(input, { prettyErrors: false });
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
      `Profile YAML must have a mapping at its root, but found ${kind}.`
    );
  }
  return value as Record<string, unknown>;
}

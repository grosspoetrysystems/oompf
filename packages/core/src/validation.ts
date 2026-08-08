/**
 * Structural validation and secret scanning for OMP profile artifacts.
 *
 * `validateArtifact` performs the checks OOMPF's server indexer can run without
 * a local OMP binary: size limit, YAML parse, mapping-root shape, high-signal
 * secret scanning, and fact extraction. It is deliberately *structural* — it
 * does not claim complete OMP schema validation — and it preserves both the
 * parsed document and the original YAML for later tasks (hashing, publication,
 * rendering).
 *
 * Secret findings and error strings NEVER contain a secret value: only the key
 * path, a category, and a value-free reason.
 */

import { extractFacts, type ProfileFacts } from "./facts.ts";
import { isRecord } from "./guards.ts";
import { sha256 } from "./hash.ts";
import { assertProfileDocument, parseProfileYaml } from "./yaml-config.ts";

/** A likely secret located in the artifact, described without its value. */
export interface SecretFinding {
  /** Dotted key path to the offending value (contains no secret value). */
  readonly path: string;
  /** Category of the finding, e.g. `openai-api-key` or `credential`. */
  readonly kind: string;
  /** High-confidence findings block publication; low ones are warnings. */
  readonly confidence: "high" | "low";
  /** Value-free explanation safe to display or log. */
  readonly reason: string;
}

/** Result of structurally validating a single canonical YAML artifact. */
export interface ArtifactValidation {
  /** Structural verdict; `invalid` when size/parse/root checks fail. */
  readonly structural: "valid" | "invalid";
  /** Structural errors (oversize, unparseable YAML, non-mapping root). */
  readonly errors: readonly string[];
  /** Non-blocking advisories, including low-confidence secret findings. */
  readonly warnings: readonly string[];
  /** High-confidence findings that block publication. */
  readonly blocking: readonly SecretFinding[];
  /** Every secret finding (high and low confidence). */
  readonly findings: readonly SecretFinding[];
  /** Extracted facts, or `null` when the artifact is structurally invalid. */
  readonly facts: ProfileFacts | null;
  /** Parsed document, preserved for later tasks; `null` when invalid. */
  readonly document: Record<string, unknown> | null;
  /** The original YAML bytes as provided. */
  readonly yaml: string;
  /** UTF-8 byte length of the artifact. */
  readonly byteLength: number;
  /** SHA-256 of the canonical bytes. */
  readonly hash: string;
}

/** Default maximum artifact size: 1 MiB of UTF-8 bytes. */
export const DEFAULT_MAX_BYTES = 1024 * 1024;

/** Value patterns that identify a specific provider credential with high confidence. */
const HIGH_CONFIDENCE_VALUE_PATTERNS: Record<string, RegExp> = {
  "private-key": /-----BEGIN (?:[A-Z0-9]+ )*PRIVATE KEY-----/,
  "openai-api-key": /\bsk-[A-Za-z0-9_-]{20,}\b/,
  "github-token": /\b(?:gh[posur]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{22,})\b/,
  "aws-access-key": /\bAKIA[0-9A-Z]{16}\b/,
  "google-api-key": /\bAIza[0-9A-Za-z_-]{35}\b/,
  "slack-token": /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/,
};

/**
 * Substrings that mark a key as credential-like once separators are stripped
 * and it is lowercased (so `apiKey`, `api_key`, and `API-KEY` all match).
 */
const CREDENTIAL_KEY_SUBSTRINGS = [
  "password",
  "passwd",
  "secret",
  "apikey",
  "apitoken",
  "accesskey",
  "accesstoken",
  "authtoken",
  "credential",
  "privatekey",
  "bearer",
  "token",
] as const;

/** Literal values that are obvious placeholders rather than real secrets. */
const PLACEHOLDER_LITERALS: Record<string, true> = {
  changeme: true,
  "change-me": true,
  yourkey: true,
  "your-key": true,
  xxx: true,
  todo: true,
  redacted: true,
  example: true,
  placeholder: true,
  none: true,
  null: true,
  "...": true,
};

/** True when `key`, normalized, reads as a credential-bearing field. */
function isCredentialKey(key: string): boolean {
  const normalized = key.toLowerCase().replaceAll(/[_-]/g, "");
  return CREDENTIAL_KEY_SUBSTRINGS.some((needle) =>
    normalized.includes(needle),
  );
}

/** Classify a credential-key value as a real secret or a placeholder/ref. */
function classifyCredentialValue(value: string): "high" | "low" {
  const trimmed = value.trim();
  if (trimmed.length === 0) return "low";
  if (/^\$\{?[A-Za-z_][A-Za-z0-9_]*\}?$/.test(trimmed)) return "low";
  if (/^<.+>$/.test(trimmed)) return "low";
  if (Object.hasOwn(PLACEHOLDER_LITERALS, trimmed.toLowerCase())) return "low";
  return "high";
}

/** Evaluate one string leaf against value patterns and its key name. */
function evaluateLeaf(
  key: string,
  value: string,
  path: string,
  findings: SecretFinding[],
): void {
  for (const [kind, pattern] of Object.entries(HIGH_CONFIDENCE_VALUE_PATTERNS)) {
    if (pattern.test(value)) {
      findings.push({
        path,
        kind,
        confidence: "high",
        reason: `value matches ${kind} pattern`,
      });
      return;
    }
  }
  if (!isCredentialKey(key)) return;
  const confidence = classifyCredentialValue(value);
  findings.push({
    path,
    kind: "credential",
    confidence,
    reason:
      confidence === "high"
        ? "credential-like key holds a literal value"
        : "credential-like key references a placeholder or environment variable",
  });
}

/** Recursively scan a parsed value, recording likely secrets by key path. */
function walk(
  node: unknown,
  key: string,
  path: string,
  findings: SecretFinding[],
): void {
  if (typeof node === "string") {
    evaluateLeaf(key, node, path, findings);
    return;
  }
  if (Array.isArray(node)) {
    // Inherit the parent key so a credential-like key holding a list of
    // literals (e.g. `passwords: ["hunter2"]`) is still evaluated per element.
    node.forEach((item, index) => {
      const childPath = path === "" ? String(index) : `${path}.${index}`;
      walk(item, key, childPath, findings);
    });
    return;
  }
  if (isRecord(node)) {
    for (const [childKey, value] of Object.entries(node)) {
      const childPath = path === "" ? childKey : `${path}.${childKey}`;
      walk(value, childKey, childPath, findings);
    }
  }
}

/**
 * Recursively scan a parsed document for high- and low-confidence secrets.
 *
 * Findings identify the key path and category only — never the value — so the
 * result is safe to log, display, and persist.
 */
export function scanForSecrets(document: unknown): SecretFinding[] {
  const findings: SecretFinding[] = [];
  walk(document, "", "", findings);
  return findings;
}

/**
 * Structurally validate a canonical YAML artifact.
 *
 * Size and parse failures short-circuit with `structural: "invalid"` and no
 * facts; a valid mapping root yields secret findings, warnings, and extracted
 * facts. The original YAML, its UTF-8 byte length, and SHA-256 are always
 * returned so callers can hash and store without re-encoding.
 */
export function validateArtifact(input: {
  yaml: string;
  maxBytes?: number;
}): ArtifactValidation {
  const { yaml, maxBytes = DEFAULT_MAX_BYTES } = input;
  const byteLength = new TextEncoder().encode(yaml).length;
  const hash = sha256(yaml);
  const base = { yaml, byteLength, hash } as const;

  if (byteLength > maxBytes) {
    return {
      ...base,
      structural: "invalid",
      errors: [
        `Artifact is ${byteLength} bytes, exceeding the ${maxBytes}-byte limit.`,
      ],
      warnings: [],
      blocking: [],
      findings: [],
      facts: null,
      document: null,
    };
  }

  let parsed: unknown;
  try {
    parsed = parseProfileYaml(yaml);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      ...base,
      structural: "invalid",
      errors: [`Artifact is not valid YAML: ${message}`],
      warnings: [],
      blocking: [],
      findings: [],
      facts: null,
      document: null,
    };
  }

  let document: Record<string, unknown>;
  try {
    document = assertProfileDocument(parsed);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      ...base,
      structural: "invalid",
      errors: [message],
      warnings: [],
      blocking: [],
      findings: [],
      facts: null,
      document: null,
    };
  }

  const findings = scanForSecrets(document);
  const blocking = findings.filter((finding) => finding.confidence === "high");
  const warnings = findings
    .filter((finding) => finding.confidence === "low")
    .map((finding) => `${finding.path}: ${finding.reason}`);

  return {
    ...base,
    structural: "valid",
    errors: [],
    warnings,
    blocking,
    findings,
    facts: extractFacts(document),
    document,
  };
}

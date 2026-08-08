import { describe, expect, test } from "bun:test";

import {
  DEFAULT_MAX_BYTES,
  scanForSecrets,
  validateArtifact,
} from "./validation.ts";
import { sha256 } from "./hash.ts";
import { parseProfileYaml } from "./yaml-config.ts";

/**
 * Build a mapping-root YAML document whose UTF-8 encoding is exactly `target`
 * bytes. The head embeds a two-byte `é` so the boundary is genuinely exercised
 * against UTF-8 bytes rather than character count; the remainder is a
 * single-byte comment tail.
 */
function mappingOfByteLength(target: number): string {
  const head = 'k: "é"\n#';
  const headBytes = new TextEncoder().encode(head).length;
  if (target < headBytes) {
    throw new Error(`target ${target} below minimum ${headBytes}`);
  }
  return head + "x".repeat(target - headBytes);
}

describe("validateArtifact structural checks", () => {
  test("rejects invalid YAML without facts or document", () => {
    const result = validateArtifact({ yaml: "foo: [1, 2" });
    expect(result.structural).toBe("invalid");
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toContain("not valid YAML");
    expect(result.facts).toBeNull();
    expect(result.document).toBeNull();
  });

  test("does not leak secret values in malformed-YAML errors", () => {
    // yaml's default prettyErrors embeds the offending source lines in the
    // error message; that must never expose a secret through validation output.
    const secret = "sk-abcdefghijklmnopqrstuvwxyz0123456789";
    const yaml = `foo: [1, 2\napiKey: ${secret}\n`;
    let parseError: unknown;
    try {
      parseProfileYaml(yaml);
    } catch (error) {
      parseError = error;
    }
    expect(parseError).toBeInstanceOf(Error);
    expect((parseError as Error).message).not.toContain(secret);

    const result = validateArtifact({ yaml });
    expect(result.structural).toBe("invalid");
    // Preserved `result.yaml` intentionally holds the raw input; the leak
    // vector is the surfaced error message, so assert on `errors`.
    expect(JSON.stringify(result.errors)).not.toContain(secret);
  });

  test("rejects a scalar root", () => {
    const result = validateArtifact({ yaml: "just a scalar" });
    expect(result.structural).toBe("invalid");
    expect(result.errors[0]).toContain("mapping");
    expect(result.document).toBeNull();
  });

  test("rejects a sequence root", () => {
    const result = validateArtifact({ yaml: "- a\n- b\n" });
    expect(result.structural).toBe("invalid");
    expect(result.errors[0]).toContain("mapping");
    expect(result.facts).toBeNull();
  });

  test("accepts a mapping root and preserves the document", () => {
    const result = validateArtifact({ yaml: "theme: dark\n" });
    expect(result.structural).toBe("valid");
    expect(result.errors).toEqual([]);
    expect(result.document).toEqual({ theme: "dark" });
    expect(result.facts).not.toBeNull();
    expect(result.blocking).toEqual([]);
  });
});

describe("validateArtifact size boundary (UTF-8 bytes)", () => {
  test("accepts an artifact below the default limit", () => {
    const yaml = mappingOfByteLength(DEFAULT_MAX_BYTES - 100);
    const result = validateArtifact({ yaml });
    expect(result.byteLength).toBe(DEFAULT_MAX_BYTES - 100);
    expect(result.structural).toBe("valid");
  });

  test("accepts an artifact exactly at the default limit", () => {
    const yaml = mappingOfByteLength(DEFAULT_MAX_BYTES);
    const result = validateArtifact({ yaml });
    expect(result.byteLength).toBe(DEFAULT_MAX_BYTES);
    expect(result.structural).toBe("valid");
  });

  test("rejects an artifact one byte above the default limit", () => {
    const yaml = mappingOfByteLength(DEFAULT_MAX_BYTES + 1);
    const result = validateArtifact({ yaml });
    expect(result.byteLength).toBe(DEFAULT_MAX_BYTES + 1);
    expect(result.structural).toBe("invalid");
    expect(result.errors[0]).toContain("exceeding");
  });

  test("counts multi-byte characters as UTF-8 bytes, not code points", () => {
    // Four "😀" are 4 code points but 16 UTF-8 bytes.
    const yaml = 'k: "😀😀😀😀"\n';
    const encoded = new TextEncoder().encode(yaml).length;
    expect(encoded).toBeGreaterThan(yaml.length);
    const overByBytes = validateArtifact({ yaml, maxBytes: encoded - 1 });
    expect(overByBytes.structural).toBe("invalid");
    const withinBytes = validateArtifact({ yaml, maxBytes: encoded });
    expect(withinBytes.structural).toBe("valid");
  });
});

describe("scanForSecrets", () => {
  test("flags provider credential patterns as high confidence", () => {
    const doc = {
      openai: "sk-abcdefghijklmnopqrstuvwxyz0123456789",
      github: "ghp_0123456789abcdefghijklmnopqrstuvwx12",
      aws: "AKIAABCDEFGHIJKLMNOP",
      pem: "-----BEGIN RSA PRIVATE KEY-----\nMIIabc\n-----END RSA PRIVATE KEY-----",
    };
    const findings = scanForSecrets(doc);
    const kinds = findings.map((f) => f.kind).sort();
    expect(kinds).toEqual([
      "aws-access-key",
      "github-token",
      "openai-api-key",
      "private-key",
    ]);
    expect(findings.every((f) => f.confidence === "high")).toBe(true);
  });

  test("flags a credential-like key with a literal value", () => {
    const findings = scanForSecrets({ apiKey: "a-real-looking-token-value" });
    expect(findings).toEqual([
      {
        path: "apiKey",
        kind: "credential",
        confidence: "high",
        reason: "credential-like key holds a literal value",
      },
    ]);
  });

  test("treats environment references and placeholders as low confidence", () => {
    const findings = scanForSecrets({
      password: "${DB_PASSWORD}",
      token: "<your-token>",
    });
    expect(findings.length).toBe(2);
    expect(findings.every((f) => f.confidence === "low")).toBe(true);
  });

  test("scans nested mappings and sequences by path", () => {
    const findings = scanForSecrets({
      providers: [{ key: "sk-abcdefghijklmnopqrstuvwxyz0123456789" }],
    });
    expect(findings).toHaveLength(1);
    expect(findings[0]?.path).toBe("providers.0.key");
    expect(findings[0]?.kind).toBe("openai-api-key");
  });

  test("never includes the secret value in findings", () => {
    const secret = "sk-abcdefghijklmnopqrstuvwxyz0123456789";
    const findings = scanForSecrets({ token: secret });
    expect(JSON.stringify(findings)).not.toContain(secret);
  });

  test("detects a secret in a list held by a credential-like key", () => {
    // Regression: array recursion previously dropped the parent key, so a
    // credential-like key holding a list of literals produced no finding.
    const findings = scanForSecrets({ passwords: ["hunter2"] });
    expect(findings).toHaveLength(1);
    expect(findings[0]?.path).toBe("passwords.0");
    expect(findings[0]?.kind).toBe("credential");
    expect(findings[0]?.confidence).toBe("high");
    expect(JSON.stringify(findings)).not.toContain("hunter2");
  });
});

describe("validateArtifact secret handling", () => {
  test("high-confidence findings block and never leak the value", () => {
    const secret = "ghp_0123456789abcdefghijklmnopqrstuvwx12";
    const result = validateArtifact({ yaml: `githubToken: "${secret}"\n` });
    expect(result.structural).toBe("valid");
    expect(result.blocking).toHaveLength(1);
    expect(result.blocking[0]?.kind).toBe("github-token");
    const serialized = JSON.stringify({
      errors: result.errors,
      warnings: result.warnings,
      blocking: result.blocking,
      findings: result.findings,
    });
    expect(serialized).not.toContain(secret);
  });

  test("low-confidence findings surface as warnings, not blockers", () => {
    const result = validateArtifact({ yaml: 'apiKey: "${OPENAI_API_KEY}"\n' });
    expect(result.structural).toBe("valid");
    expect(result.blocking).toEqual([]);
    expect(result.warnings.length).toBe(1);
    expect(result.warnings[0]).toContain("apiKey");
  });
});

describe("sha256", () => {
  test("hashes UTF-8 bytes deterministically", () => {
    // Known SHA-256 of the ASCII string "abc".
    expect(sha256("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
    expect(sha256("abc")).toBe(sha256("abc"));
  });

  test("hashes a string and its UTF-8 byte array identically", () => {
    const text = "theme: dark\n";
    const bytes = new TextEncoder().encode(text);
    expect(sha256(text)).toBe(sha256(bytes));
  });

  test("distinct inputs produce distinct digests", () => {
    expect(sha256("a")).not.toBe(sha256("b"));
  });

  test("validateArtifact reports the canonical content hash", () => {
    const yaml = "theme: dark\n";
    expect(validateArtifact({ yaml }).hash).toBe(sha256(yaml));
  });
});

describe("parseProfileYaml runtime portability", () => {
  test("parses without Bun.YAML (Cloudflare Worker compatible)", () => {
    // The `Bun` global is not in the ES lib types; probe it structurally to
    // prove parseProfileYaml no longer depends on Bun.YAML at all.
    const runtime = globalThis as unknown as { Bun?: { YAML?: unknown } };
    const bun = runtime.Bun;
    const savedYaml = bun?.YAML;
    if (bun) bun.YAML = undefined;
    try {
      expect(parseProfileYaml("theme: dark\nmodels:\n  - a\n")).toEqual({
        theme: "dark",
        models: ["a"],
      });
    } finally {
      if (bun) bun.YAML = savedYaml;
    }
  });
});

/**
 * Post-deploy smoke against a live origin.
 *
 * The Deploy workflow used to report success the moment Wrangler finished
 * uploading. A release that left every database-backed route returning 500 was
 * indistinguishable from a healthy one, and the outage was found by hand.
 *
 * This asserts the responses a working deployment must produce — including
 * shape, not just status, because a 200 carrying an error envelope is still a
 * broken index.
 *
 * Usage: `bun scripts/smoke-deployed.ts [origin]`
 * Origin defaults to `OOMPF_BASE_URL`, then to production.
 */

const origin = (
  process.argv[2] ??
  process.env.OOMPF_BASE_URL ??
  "https://oompf.run"
).replace(/\/$/, "");

const TIMEOUT_MS = 20_000;

interface Check {
  /** Extra assertions on the body; return an error string, or null when ok. */
  readonly assert?: (body: string) => string | null;
  readonly name: string;
  readonly path: string;
}

/** Parse JSON, returning an error string rather than throwing. */
function parseJson(body: string): { error: string } | { value: unknown } {
  try {
    return { value: JSON.parse(body) };
  } catch {
    return { error: `body is not valid JSON: ${body.slice(0, 120)}` };
  }
}

const CHECKS: readonly Check[] = [
  { name: "home", path: "/" },
  { name: "docs index", path: "/docs/" },
  { name: "llms index", path: "/llms.txt" },
  { name: "docs llms index", path: "/docs/llms.txt" },
  {
    assert: (body) => {
      const parsed = parseJson(body);
      if ("error" in parsed) {
        return parsed.error;
      }
      const doc = parsed.value as { openapi?: unknown; paths?: unknown };
      return typeof doc.openapi === "string" && doc.paths !== undefined
        ? null
        : "openapi document is missing `openapi` or `paths`";
    },
    name: "openapi",
    path: "/openapi.json",
  },
  {
    // The route that 500'd behind a green deploy. A 200 is not enough: the
    // error envelope is also served with a 200 by some proxies, and an empty
    // index is a legitimate result, so assert the documented shape.
    assert: (body) => {
      const parsed = parseJson(body);
      if ("error" in parsed) {
        return parsed.error;
      }
      const doc = parsed.value as { error?: unknown; results?: unknown };
      if (doc.error !== undefined) {
        return `search returned an error envelope: ${JSON.stringify(doc.error)}`;
      }
      return Array.isArray(doc.results)
        ? null
        : "search response has no `results` array";
    },
    name: "search api",
    path: "/api/v1/search?q=",
  },
  {
    // The pre-v1 alias must keep working for already-installed clients.
    assert: (body) =>
      "error" in parseJson(body) ? "compatibility alias broke" : null,
    name: "search api (compat alias)",
    path: "/api/search?q=",
  },
];

let failed = 0;

for (const check of CHECKS) {
  const url = `${origin}${check.path}`;
  try {
    const response = await fetch(url, {
      headers: { "user-agent": "oompf-deploy-smoke" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const body = await response.text();

    if (!response.ok) {
      process.stdout.write(
        `FAIL  ${check.name}: HTTP ${response.status} ${url}\n      ${body.slice(0, 200)}\n`
      );
      failed += 1;
      continue;
    }

    const problem = check.assert?.(body) ?? null;
    if (problem !== null) {
      process.stdout.write(`FAIL  ${check.name}: ${problem}\n      ${url}\n`);
      failed += 1;
      continue;
    }

    process.stdout.write(`ok    ${check.name} (${response.status})\n`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stdout.write(`FAIL  ${check.name}: ${message}\n      ${url}\n`);
    failed += 1;
  }
}

if (failed > 0) {
  process.stdout.write(`\n${failed} check(s) failed against ${origin}\n`);
  process.exit(1);
}

process.stdout.write(
  `\nall ${CHECKS.length} checks passed against ${origin}\n`
);

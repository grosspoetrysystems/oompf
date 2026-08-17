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

/**
 * Every `.md` link in both agent-facing llms.txt maps must resolve against
 * the live origin, so a documentation slug rename or typo surfaces here
 * instead of as a 404 for agents. Read the links from the files themselves;
 * this stays in sync as the docs change.
 */
const MAPS = [
  "apps/web/public/llms.txt",
  "apps/web/public/docs/llms.txt",
] as const;
const LINK_RE = /https?:\/\/[^/]+(\/[^\s)]+\.md)/g;

const mdChecks: Check[] = [];
const seen = new Set<string>();
for (const map of MAPS) {
  const text = await Bun.file(new URL(`../${map}`, import.meta.url)).text();
  for (const match of text.matchAll(LINK_RE)) {
    const path = match[1];
    if (seen.has(path)) {
      continue;
    }
    seen.add(path);
    mdChecks.push({ name: `llms link ${path}`, path });
  }
}

const checks = [...CHECKS, ...mdChecks];

let failed = 0;

for (const check of checks) {
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

/**
 * The rate limiter must actually enforce in production.
 *
 * GPS-139 shipped the binding; GPS-159 found it inert. The Worker deployed
 * with `env.PROFILE_RATE_LIMITER (5 requests/60s)` bound and reachable, but the
 * code read it from the module env instead of the request-scoped runtime, so
 * the public write endpoint stayed unmetered behind a green deploy. Only a live
 * burst proves enforcement, so assert one.
 *
 * Empty bodies never write: the limiter runs before body parsing, so every
 * request here is either 429 or a 400 that touches nothing. This runs last so
 * it cannot rate-limit the checks above.
 */
const BURST = 8;
const statuses: number[] = [];
let sawRateLimit = false;
for (let attempt = 1; attempt <= BURST; attempt += 1) {
  const response = await fetch(`${origin}/api/v1/profiles`, {
    body: "{}",
    headers: {
      "content-type": "application/json",
      "user-agent": "oompf-deploy-smoke",
    },
    method: "POST",
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  statuses.push(response.status);
  if (response.status === 429) {
    sawRateLimit = true;
    break;
  }
}

if (sawRateLimit) {
  process.stdout.write(
    `ok    register rate limit (429 after ${statuses.length - 1} allowed)\n`
  );
} else {
  process.stdout.write(
    `FAIL  register rate limit: ${BURST} rapid POSTs never returned 429 (statuses ${statuses.join(",")}); the public write endpoint is unmetered\n`
  );
  failed += 1;
}

if (failed > 0) {
  process.stdout.write(`\n${failed} check(s) failed against ${origin}\n`);
  process.exit(1);
}

process.stdout.write(
  `\nall ${checks.length + 1} checks passed against ${origin}\n`
);

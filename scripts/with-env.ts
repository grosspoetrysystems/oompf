import { existsSync } from "node:fs";

const ENV_FILE = ".env.local";

/** Merge local values without overriding values supplied by CI or the shell. */
export function mergeEnvironment(
  local: Record<string, string>,
  processEnvironment: Record<string, string | undefined>
): Record<string, string> {
  const merged = { ...local };
  for (const [key, value] of Object.entries(processEnvironment)) {
    if (value !== undefined) {
      merged[key] = value;
    }
  }
  return merged;
}

function parseEnvFile(content: string): Record<string, string> {
  const values: Record<string, string> = {};
  for (const rawLine of content.split(/\r?\n/u)) {
    const line = rawLine.trim();
    if (line === "" || line.startsWith("#")) {
      continue;
    }
    const assignment = line.startsWith("export ") ? line.slice(7) : line;
    const separator = assignment.indexOf("=");
    if (separator <= 0) {
      continue;
    }
    const key = assignment.slice(0, separator).trim();
    let value = assignment.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    values[key] = value;
  }
  return values;
}

export async function readLocalEnvironment(
  path = ENV_FILE
): Promise<Record<string, string>> {
  if (!existsSync(path)) {
    return {};
  }
  return parseEnvFile(await Bun.file(path).text());
}

if (import.meta.main) {
  const command = Bun.argv.slice(2);
  if (command[0] === "--") {
    command.shift();
  }
  if (command.length === 0) {
    console.error("Usage: bun scripts/with-env.ts -- <command> [args...]");
    process.exit(2);
  }

  const localEnvironment = await readLocalEnvironment();
  const child = Bun.spawn(command, {
    env: mergeEnvironment(localEnvironment, process.env),
    stderr: "inherit",
    stdin: "inherit",
    stdout: "inherit",
  });
  process.exit(await child.exited);
}

/**
 * Local memory of where each native OMP profile was published.
 *
 * `oompf publish` reuses the recorded Gist so a second publish of the same
 * profile patches the existing public artifact instead of forking a new one,
 * which is what keeps an already-shared `/p/<id>` link pointing at current
 * bytes. The store is a plain JSON object at `~/.oompf/publications.json`,
 * keyed by native profile name, so an author can read or delete it by hand. It
 * holds coordinates only — never artifact content and never credentials.
 *
 * The store is advisory: an absent, unreadable, or malformed file degrades to
 * "no prior publication" and the caller creates a new Gist, because losing a
 * local file must never block publishing.
 */

import { dirname } from "node:path";

import type { FsSeam } from "./deps.ts";

/** One recorded publication of a native profile. */
export interface Publication {
  /** Filename inside the Gist, needed to patch the same file. */
  readonly filename: string;
  /** The Gist that carries this profile. */
  readonly gistId: string;
  /** Exact source URL registered with the index, replayed to keep `/p/<id>`. */
  readonly source: string;
}

/** Whether a parsed value carries every field a {@link Publication} needs. */
function isPublication(value: unknown): value is Publication {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as Publication).filename === "string" &&
    typeof (value as Publication).gistId === "string" &&
    typeof (value as Publication).source === "string"
  );
}

/** Read the whole store, or `{}` when it is absent or unusable. */
async function readAll(
  fs: FsSeam,
  path: string
): Promise<Record<string, unknown>> {
  if (!(await fs.exists(path))) {
    return {};
  }
  try {
    const parsed: unknown = JSON.parse(await fs.readFile(path));
    return typeof parsed === "object" &&
      parsed !== null &&
      !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

/** The publication recorded for `profile`, or `null` when there is none. */
export async function readPublication(
  fs: FsSeam,
  path: string,
  profile: string
): Promise<Publication | null> {
  const entry = (await readAll(fs, path))[profile];
  return isPublication(entry) ? entry : null;
}

/** Record `publication` for `profile`, preserving every other entry. */
export async function writePublication(
  fs: FsSeam,
  path: string,
  profile: string,
  publication: Publication
): Promise<void> {
  const all = await readAll(fs, path);
  all[profile] = publication;
  await fs.mkdir(dirname(path), 0o700);
  await fs.writeFile(path, `${JSON.stringify(all, null, 2)}\n`, 0o600);
}

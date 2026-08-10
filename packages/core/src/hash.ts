/**
 * Deterministic content hashing.
 *
 * OOMPF identifies a canonical profile artifact by the SHA-256 of its exact
 * published bytes. Hashing MUST be byte-exact and stable across the CLI and the
 * server indexer, so a string input is hashed as its UTF-8 encoding and a
 * `Uint8Array` is hashed verbatim.
 */

import { createHash } from "node:crypto";

/**
 * Compute the lowercase hex SHA-256 digest of `input`.
 *
 * Strings are hashed as their UTF-8 bytes; a {@link Uint8Array} is hashed
 * exactly as given. The digest is deterministic and identical for equal bytes.
 */
export function sha256(input: string | Uint8Array): string {
  const hash = createHash("sha256");
  if (typeof input === "string") {
    hash.update(input, "utf8");
  } else {
    hash.update(input);
  }
  return hash.digest("hex");
}

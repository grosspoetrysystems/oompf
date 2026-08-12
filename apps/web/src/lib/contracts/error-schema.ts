/**
 * JSON Schema (2020-12) for the stable OOMPF error envelope.
 *
 * Every non-2xx API response — versioned or compatibility alias — serializes
 * this shape. The `code` enumerates the stable machine-readable error codes the
 * routes emit (see `IndexErrorCode` in the index-profile service); `message` is
 * human-readable and `details` carries optional value-free specifics (never a
 * secret). This object is the single source of truth: it is served verbatim at
 * `/schemas/error.json` and referenced by `/openapi.json`.
 */

/** Stable error codes surfaced in `error.code`. Mirror of `IndexErrorCode`. */
const ERROR_CODES = [
  "invalid_source",
  "source_not_found",
  "ambiguous_source",
  "source_unreachable",
  "validation_failed",
  "blocking_secrets",
  "not_found",
  "server_misconfigured",
  "internal_error",
] as const;

/** The `/schemas/error.json` document. */
export const errorSchema = {
  $id: "https://oompf.run/schemas/error.json",
  $schema: "https://json-schema.org/draft/2020-12/schema",
  additionalProperties: false,
  description:
    "Stable JSON error envelope returned by every non-2xx OOMPF API response.",
  examples: [
    {
      error: {
        code: "not_found",
        message: 'No indexed profile with id "prof_0000".',
      },
    },
    {
      error: {
        code: "validation_failed",
        details: ["modelRoles must be a mapping of role to model."],
        message: "The profile is not a structurally valid OMP artifact.",
      },
    },
  ],
  properties: {
    error: {
      additionalProperties: false,
      properties: {
        code: {
          description: "Stable machine-readable error code.",
          enum: [...ERROR_CODES],
          type: "string",
        },
        details: {
          description:
            "Optional actionable specifics. Never contains a secret value.",
          items: { type: "string" },
          type: "array",
        },
        message: {
          description: "Human-readable explanation of the failure.",
          type: "string",
        },
      },
      required: ["code", "message"],
      type: "object",
    },
  },
  required: ["error"],
  title: "OOMPF Error Envelope",
  type: "object",
} as const;

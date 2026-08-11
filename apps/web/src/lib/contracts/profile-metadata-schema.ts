/**
 * JSON Schema (2020-12) for the profile metadata record returned by
 * `GET /api/v1/profiles/:id` (and its `/api/profiles/:id` compatibility alias).
 *
 * It describes the persisted metadata-only record: provenance coordinates,
 * source-derived native OMP `facts` (including OMP `aliases`), the structural
 * `validation` verdict, and the publisher-curated `oompf` `metadata` block
 * (`summary`/`kind`/`tags`/`links`). No canonical artifact content is ever
 * present. The `$defs.profileMetadata` block mirrors `ProfileMetadata` from
 * `@oompf/core`. This object is served verbatim at
 * `/schemas/profile-metadata.json` and referenced by `/openapi.json`.
 */

/** The `/schemas/profile-metadata.json` document. */
export const profileMetadataSchema = {
  $defs: {
    profileFacts: {
      additionalProperties: true,
      description:
        "Reliable, source-derived facts about the native OMP artifact. Forward-compatible: unrecognized fields are preserved.",
      properties: {
        advisor: {
          description: "Observed advisor settings, or null when absent.",
          type: ["object", "null"],
        },
        aliases: {
          description:
            'OMP alias selectors (values beginning with "@"), classified out of `models` and `providers`.',
          items: { type: "string" },
          type: "array",
        },
        disabledProviders: { items: { type: "string" }, type: "array" },
        extensions: { items: { type: "string" }, type: "array" },
        fallbackChains: {
          items: {
            additionalProperties: false,
            properties: {
              models: { items: { type: "string" }, type: "array" },
              role: { type: "string" },
            },
            required: ["models", "role"],
            type: "object",
          },
          type: "array",
        },
        fields: {
          description:
            "Recognized scalar identity fields present in the document.",
          type: "object",
        },
        hooks: { items: { type: "string" }, type: "array" },
        modelRoles: {
          items: {
            additionalProperties: false,
            properties: {
              model: { type: "string" },
              role: { type: "string" },
            },
            required: ["model", "role"],
            type: "object",
          },
          type: "array",
        },
        models: {
          description: "Distinct concrete model identifiers (never aliases).",
          items: { type: "string" },
          type: "array",
        },
        prerequisites: {
          description:
            "Actionable non-provider requirements only (environment, extension, project-overlay).",
          items: {
            additionalProperties: false,
            properties: {
              kind: {
                enum: [
                  "provider",
                  "environment",
                  "project-overlay",
                  "extension",
                ],
                type: "string",
              },
              name: { type: "string" },
              reason: { type: "string" },
            },
            required: ["kind", "name", "reason"],
            type: "object",
          },
          type: "array",
        },
        providers: {
          description:
            "Providers inferred from `<provider>/<model>` identifiers.",
          items: { type: "string" },
          type: "array",
        },
        unknownKeys: {
          description:
            "Top-level keys OOMPF does not recognize, preserved for forward compat.",
          items: { type: "string" },
          type: "array",
        },
      },
      required: ["models", "providers", "aliases"],
      type: "object",
    },
    profileMetadata: {
      additionalProperties: false,
      description:
        "Publisher-curated OOMPF metadata from the optional namespaced `oompf` block. Mirrors ProfileMetadata in @oompf/core.",
      properties: {
        kind: {
          description:
            "Profile kind. `controlled` is true only when `value` is a standard kind.",
          oneOf: [
            {
              additionalProperties: false,
              properties: {
                controlled: { type: "boolean" },
                value: { type: "string" },
              },
              required: ["controlled", "value"],
              type: "object",
            },
            { type: "null" },
          ],
        },
        links: {
          description:
            "Publisher-provided links. Never guessed; only what the author declared.",
          items: {
            additionalProperties: false,
            properties: {
              label: { type: ["string", "null"] },
              url: { type: "string" },
            },
            required: ["label", "url"],
            type: "object",
          },
          type: "array",
        },
        summary: {
          description: "Optional plain-text, length-limited author summary.",
          type: ["string", "null"],
        },
        tags: { items: { type: "string" }, type: "array" },
      },
      required: ["summary", "kind", "tags", "links"],
      type: "object",
    },
    secretFinding: {
      additionalProperties: false,
      description:
        "A value-free secret finding. Names a path and kind, never the value.",
      properties: {
        confidence: { enum: ["high", "low"], type: "string" },
        kind: { type: "string" },
        path: { type: "string" },
        reason: { type: "string" },
      },
      required: ["confidence", "kind", "path", "reason"],
      type: "object",
    },
    validationMetadata: {
      additionalProperties: false,
      description:
        "Structural validation results and value-free secret advisories. Never carries a secret value or canonical bytes.",
      properties: {
        blocking: { items: { $ref: "#/$defs/secretFinding" }, type: "array" },
        byteLength: {
          description:
            "UTF-8 byte length of the artifact the metadata was derived from.",
          type: "integer",
        },
        errors: { items: { type: "string" }, type: "array" },
        findings: { items: { $ref: "#/$defs/secretFinding" }, type: "array" },
        hash: {
          description:
            "SHA-256 of the canonical bytes, for cross-checking sources.",
          type: "string",
        },
        structural: { enum: ["valid", "invalid"], type: "string" },
        warnings: { items: { type: "string" }, type: "array" },
      },
      required: [
        "blocking",
        "byteLength",
        "errors",
        "findings",
        "hash",
        "structural",
        "warnings",
      ],
      type: "object",
    },
  },
  $id: "https://oompf.run/schemas/profile-metadata.json",
  $schema: "https://json-schema.org/draft/2020-12/schema",
  additionalProperties: false,
  description:
    "A single indexed OMP profile's metadata-only record. Contains no canonical artifact content.",
  properties: {
    contentHash: {
      description: "Lowercase hex SHA-256 of the canonical source bytes.",
      type: "string",
    },
    createdAt: {
      description: "First-indexed timestamp (ISO 8601).",
      format: "date-time",
      type: "string",
    },
    facts: { $ref: "#/$defs/profileFacts" },
    gistId: {
      description:
        "Opaque Gist identifier when the source is a Gist, else null.",
      type: ["string", "null"],
    },
    id: {
      description: "Stable opaque profile identifier (prof_<32 hex>).",
      pattern: "^prof_[0-9a-f]{32}$",
      type: "string",
    },
    metadata: {
      description:
        "Publisher-curated OOMPF metadata. May be null for records indexed before the metadata contract.",
      oneOf: [{ $ref: "#/$defs/profileMetadata" }, { type: "null" }],
    },
    ompVersion: {
      description:
        "OMP version the profile declares it targets, when declared.",
      type: ["string", "null"],
    },
    owner: {
      description: "Source owner login, or null for anonymous sources.",
      type: ["string", "null"],
    },
    profileName: {
      description: "Human-facing profile name (validated <name>).",
      type: "string",
    },
    revision: {
      description:
        "Pinned source revision (git SHA) the metadata was read from.",
      type: ["string", "null"],
    },
    sourceType: { description: 'Origin kind, e.g. "gist".', type: "string" },
    sourceUrl: {
      description: "Canonical, normalized source URL; unique across the index.",
      type: "string",
    },
    updatedAt: {
      description:
        "Last-updated timestamp (ISO 8601); bumped only when metadata changes.",
      format: "date-time",
      type: "string",
    },
    validation: { $ref: "#/$defs/validationMetadata" },
  },
  required: [
    "id",
    "sourceUrl",
    "sourceType",
    "profileName",
    "contentHash",
    "createdAt",
    "updatedAt",
    "facts",
    "validation",
  ],
  title: "OOMPF Profile Metadata Record",
  type: "object",
} as const;

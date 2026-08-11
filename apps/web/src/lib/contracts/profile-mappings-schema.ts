/**
 * JSON Schema (2020-12) for the curated provider/model mapping responses
 * returned by `GET /api/v1/mappings/providers` and
 * `GET /api/v1/mappings/models/:provider` (and their `/api` aliases).
 *
 * `$defs.providerLink` and `$defs.modelDisplay` mirror the curated registry
 * types exported from `@oompf/core`. The registry never fabricates URLs: `url`
 * is `null` unless a verified public destination is curated. This object is
 * served verbatim at `/schemas/profile-mappings.json` and referenced by
 * `/openapi.json`.
 */

/** The `/schemas/profile-mappings.json` document. */
export const profileMappingsSchema = {
  $defs: {
    modelDisplay: {
      additionalProperties: false,
      description:
        "Curated display facts for a model selector. Mirrors ModelDisplay in @oompf/core.",
      properties: {
        friendlyName: {
          description: "Human-friendly model name shown first in the UI.",
          type: "string",
        },
        isAlias: {
          description:
            'True when the selector is an OMP alias (begins with "@").',
          type: "boolean",
        },
        providerId: {
          description: "Owning provider id, or null when unknown/aliased.",
          type: ["string", "null"],
        },
        selector: {
          description: "The exact model selector as written in the artifact.",
          type: "string",
        },
        url: {
          description:
            "Canonical public URL for the model, or null when not curated (never guessed).",
          type: ["string", "null"],
        },
      },
      required: ["selector", "friendlyName", "providerId", "url", "isAlias"],
      type: "object",
    },
    providerLink: {
      additionalProperties: false,
      description:
        "Curated identity and canonical link for a provider. Mirrors ProviderLink in @oompf/core.",
      properties: {
        displayName: {
          description: "Human-friendly provider name.",
          type: "string",
        },
        providerId: {
          description:
            "Stable provider id used in selectors and mapping routes.",
          type: "string",
        },
        url: {
          description:
            "Canonical public URL for the provider, or null when not curated (never guessed).",
          type: ["string", "null"],
        },
      },
      required: ["providerId", "displayName", "url"],
      type: "object",
    },
  },
  $id: "https://oompf.run/schemas/profile-mappings.json",
  $schema: "https://json-schema.org/draft/2020-12/schema",
  description:
    "Curated provider/model mapping responses. The registry never fabricates unknown links.",
  oneOf: [
    {
      additionalProperties: false,
      description: "Response of GET /api/v1/mappings/providers.",
      properties: {
        providers: { items: { $ref: "#/$defs/providerLink" }, type: "array" },
      },
      required: ["providers"],
      title: "Provider mappings response",
      type: "object",
    },
    {
      additionalProperties: false,
      description: "Response of GET /api/v1/mappings/models/:provider.",
      properties: {
        models: { items: { $ref: "#/$defs/modelDisplay" }, type: "array" },
        provider: {
          description: "The provider id the models belong to.",
          type: "string",
        },
      },
      required: ["provider", "models"],
      title: "Model mappings response",
      type: "object",
    },
  ],
  title: "OOMPF Profile Mappings",
} as const;

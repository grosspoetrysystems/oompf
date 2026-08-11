/**
 * OpenAPI 3.1 description of the canonical OOMPF agent API.
 *
 * Describes every `/api/v1` operation — profile registration, profile
 * metadata, search, and the curated provider/model mappings — with parameters,
 * request/response shapes, and the stable error envelope. The three published
 * JSON Schema documents are embedded verbatim as components (each keeps its own
 * `$id`, so their internal `$defs` references resolve), keeping this document
 * and `/schemas/*.json` a single source of truth. Compatibility `/api/...`
 * routes share these handlers and contracts and are noted per operation rather
 * than duplicated as paths. Served at `/openapi.json`.
 */

import { errorSchema } from "./error-schema.ts";
import { profileMappingsSchema } from "./profile-mappings-schema.ts";
import { profileMetadataSchema } from "./profile-metadata-schema.ts";

/** OpenAPI document version, tracked independently of the workspace version. */
export const OPENAPI_VERSION = "1.0.0";

const errorResponse = (description: string) => ({
  content: {
    "application/json": { schema: { $ref: "#/components/schemas/Error" } },
  },
  description,
});

/** Build the OpenAPI 3.1 document for the canonical OOMPF API. */
export const openApiDocument = {
  components: {
    schemas: {
      CompactProfile: {
        additionalProperties: false,
        description:
          "A compact, metadata-only profile summary used in search results and listings.",
        properties: {
          id: { pattern: "^prof_[0-9a-f]{32}$", type: "string" },
          kind: {
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
          models: { items: { type: "string" }, type: "array" },
          name: { type: "string" },
          ompVersion: { type: ["string", "null"] },
          owner: { type: ["string", "null"] },
          providers: { items: { type: "string" }, type: "array" },
          revision: { type: ["string", "null"] },
          source: { type: "string" },
          structural: { enum: ["valid", "invalid"], type: "string" },
          summary: { type: ["string", "null"] },
          tags: { items: { type: "string" }, type: "array" },
          updatedAt: { format: "date-time", type: "string" },
          url: { type: "string" },
        },
        required: [
          "id",
          "name",
          "models",
          "providers",
          "source",
          "structural",
          "updatedAt",
          "url",
        ],
        type: "object",
      },
      Error: errorSchema,
      ModelMappings: {
        additionalProperties: false,
        properties: {
          models: {
            items: {
              $ref: "#/components/schemas/ProfileMappings/$defs/modelDisplay",
            },
            type: "array",
          },
          provider: { type: "string" },
        },
        required: ["provider", "models"],
        type: "object",
      },
      ProfileMappings: profileMappingsSchema,
      ProfileMetadataRecord: profileMetadataSchema,
      ProviderMappings: {
        additionalProperties: false,
        properties: {
          providers: {
            items: {
              $ref: "#/components/schemas/ProfileMappings/$defs/providerLink",
            },
            type: "array",
          },
        },
        required: ["providers"],
        type: "object",
      },
      RegisterResponse: {
        additionalProperties: false,
        description: "Response of POST /api/v1/profiles.",
        properties: {
          id: { pattern: "^prof_[0-9a-f]{32}$", type: "string" },
          source: {
            description: "Canonical, normalized source URL that was indexed.",
            type: "string",
          },
          url: {
            description: "OOMPF profile page path, /p/<id>.",
            type: "string",
          },
          validation: {
            additionalProperties: false,
            properties: {
              errors: { items: { type: "string" }, type: "array" },
              level: { const: "structural", type: "string" },
              structural: { enum: ["valid", "invalid"], type: "string" },
              warnings: { items: { type: "string" }, type: "array" },
            },
            required: ["level", "structural", "errors", "warnings"],
            type: "object",
          },
        },
        required: ["id", "source", "url", "validation"],
        type: "object",
      },
      SearchResponse: {
        additionalProperties: false,
        description: "Response of GET /api/v1/search.",
        properties: {
          query: { type: "string" },
          results: {
            items: { $ref: "#/components/schemas/CompactProfile" },
            type: "array",
          },
        },
        required: ["query", "results"],
        type: "object",
      },
    },
  },
  info: {
    description:
      "Canonical machine-readable API for the OOMPF public index of OMP profiles. Responses carry metadata only — never canonical artifact content. Unversioned /api/... routes are compatibility aliases that share these handlers.",
    title: "OOMPF API",
    version: OPENAPI_VERSION,
  },
  openapi: "3.1.0",
  paths: {
    "/api/v1/mappings/models/{provider}": {
      get: {
        description:
          "Curated model patterns, friendly names, and canonical links for a provider. Unknown providers return a not_found error; curated models never carry a guessed URL. Alias: GET /api/mappings/models/{provider}.",
        operationId: "getModelMappings",
        parameters: [
          {
            description: "Provider id, e.g. anthropic.",
            in: "path",
            name: "provider",
            required: true,
            schema: { type: "string" },
          },
        ],
        responses: {
          "200": {
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ModelMappings" },
              },
            },
            description: "Curated model mappings for the provider.",
          },
          "400": errorResponse("The provider id is missing."),
          "404": errorResponse("No curated model mappings for the provider."),
        },
        summary: "Curated model mappings for a provider",
        tags: ["mappings"],
      },
    },
    "/api/v1/mappings/providers": {
      get: {
        description:
          "Curated provider identities and canonical links. Providers are never invented and url is null unless a verified destination is curated. Alias: GET /api/mappings/providers.",
        operationId: "getProviderMappings",
        responses: {
          "200": {
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ProviderMappings" },
              },
            },
            description: "The curated provider registry.",
          },
        },
        summary: "Curated provider mappings",
        tags: ["mappings"],
      },
    },
    "/api/v1/profiles": {
      post: {
        description:
          "Fetch, structurally validate, normalize, and index a public GitHub Gist. Persists and returns metadata only. Alias: POST /api/profiles.",
        operationId: "registerProfile",
        requestBody: {
          content: {
            "application/json": {
              schema: {
                additionalProperties: false,
                properties: {
                  ompVersion: {
                    description: "OMP version the publisher declares, if any.",
                    type: "string",
                  },
                  source: {
                    description: "A public Gist URL or bare Gist ID.",
                    type: "string",
                  },
                },
                required: ["source"],
                type: "object",
              },
            },
          },
          required: true,
        },
        responses: {
          "200": {
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/RegisterResponse" },
              },
            },
            description: "The source was indexed (or already indexed).",
          },
          "400": errorResponse("The request body or source is invalid."),
          "404": errorResponse("The source Gist was not found."),
          "422": errorResponse(
            "The source is ambiguous, or the artifact is structurally invalid or carries blocking secrets."
          ),
          "502": errorResponse("The source could not be reached."),
        },
        summary: "Register a public Gist",
        tags: ["profiles"],
      },
    },
    "/api/v1/profiles/{id}": {
      get: {
        description:
          "Fetch a single profile's metadata, validation, facts, OOMPF metadata, and provenance. Alias: GET /api/profiles/{id}.",
        operationId: "getProfile",
        parameters: [
          {
            description: "Stable opaque profile id (prof_<32 hex>).",
            in: "path",
            name: "id",
            required: true,
            schema: { pattern: "^prof_[0-9a-f]{32}$", type: "string" },
          },
        ],
        responses: {
          "200": {
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ProfileMetadataRecord" },
              },
            },
            description: "The profile metadata record.",
          },
          "404": errorResponse("No indexed profile with that id."),
        },
        summary: "Get profile metadata",
        tags: ["profiles"],
      },
    },
    "/api/v1/search": {
      get: {
        description:
          "Free-text search over the profile index, returning compact metadata-only summaries. Alias: GET /api/search.",
        operationId: "searchProfiles",
        parameters: [
          {
            description: "Free-text query over indexed profile metadata.",
            in: "query",
            name: "q",
            required: false,
            schema: { type: "string" },
          },
        ],
        responses: {
          "200": {
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/SearchResponse" },
              },
            },
            description: "Matching compact profile summaries.",
          },
        },
        summary: "Search profiles",
        tags: ["profiles"],
      },
    },
  },
  servers: [
    { description: "Production", url: "https://oompf.run" },
    { description: "Local development", url: "http://localhost:4321" },
  ],
  tags: [
    {
      description: "Profile registration, metadata, and search.",
      name: "profiles",
    },
    { description: "Curated provider and model mappings.", name: "mappings" },
  ],
} as const;

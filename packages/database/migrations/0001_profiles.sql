-- Metadata-only profile index.
--
-- One row per canonical source URL. There is deliberately no artifact content
-- column: `facts` and `validation` hold derived, displayable metadata only, and
-- the canonical YAML lives at its origin (a public Gist). `id` is a stable
-- opaque identifier derived from the canonical source URL.

CREATE TABLE IF NOT EXISTS "profiles" (
  "id" text PRIMARY KEY NOT NULL,
  "source_type" text NOT NULL,
  "source_url" text NOT NULL,
  "gist_id" text,
  "owner" text,
  "profile_name" text NOT NULL,
  "omp_version" text,
  "revision" text,
  "content_hash" text NOT NULL,
  "facts" jsonb NOT NULL,
  "validation" jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

-- Enforce a single record per canonical source URL.
CREATE UNIQUE INDEX IF NOT EXISTS "profiles_source_url_key" ON "profiles" ("source_url");

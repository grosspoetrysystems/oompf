-- Add publisher-curated `oompf` metadata to the profile index.
--
-- Metadata (summary, kind, tags, links) is derived from the namespaced `oompf`
-- block of the canonical YAML. It is still metadata-only: no artifact content
-- is stored. The column is NOT NULL with an empty-metadata default so existing
-- rows and inserts that omit it remain valid; reindexing refreshes it in place.

ALTER TABLE "profiles"
  ADD COLUMN IF NOT EXISTS "metadata" jsonb NOT NULL
  DEFAULT '{"kind":null,"links":[],"summary":null,"tags":[]}'::jsonb;

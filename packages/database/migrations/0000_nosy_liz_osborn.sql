CREATE TABLE "profiles" (
	"content_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"facts" jsonb NOT NULL,
	"gist_id" text,
	"id" text PRIMARY KEY NOT NULL,
	"omp_version" text,
	"owner" text,
	"profile_name" text NOT NULL,
	"revision" text,
	"source_type" text NOT NULL,
	"source_url" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"validation" jsonb NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "profiles_source_url_key" ON "profiles" USING btree ("source_url");
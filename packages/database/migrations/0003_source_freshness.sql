ALTER TABLE "profiles" ADD COLUMN "check_failures" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "last_check_error" text;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "last_checked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "source_changed_at" timestamp with time zone;
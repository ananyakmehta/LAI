ALTER TABLE "event_config" ADD COLUMN "assignments_released_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "submissions" ADD COLUMN "parent_email" text;--> statement-breakpoint
ALTER TABLE "submissions" ADD COLUMN "parent_phone" text;
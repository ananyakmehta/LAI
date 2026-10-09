ALTER TABLE "event_config" ADD COLUMN "final_submission_deadline" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "trips" ADD COLUMN "faculty_lead" text;--> statement-breakpoint
ALTER TABLE "trips" ADD COLUMN "start_time" text;--> statement-breakpoint
ALTER TABLE "trips" ADD COLUMN "end_time" text;--> statement-breakpoint
ALTER TABLE "trips" ADD COLUMN "travel_method" text;
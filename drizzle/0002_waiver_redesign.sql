ALTER TABLE "waivers" DROP CONSTRAINT "waivers_student_email_unique";--> statement-breakpoint
ALTER TABLE "trips" ADD COLUMN "waiver_required" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "trips" ADD COLUMN "waiver_url" text;--> statement-breakpoint
ALTER TABLE "trips" ADD COLUMN "waiver_description" text;--> statement-breakpoint
ALTER TABLE "waivers" ADD COLUMN "trip_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "waivers" ADD COLUMN "acknowledged_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "waivers" DROP COLUMN "storage_path";--> statement-breakpoint
ALTER TABLE "waivers" DROP COLUMN "uploaded_at";--> statement-breakpoint
ALTER TABLE "waivers" ADD CONSTRAINT "waivers_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "waivers" ADD CONSTRAINT "waivers_student_email_trip_id_unique" UNIQUE("student_email","trip_id");

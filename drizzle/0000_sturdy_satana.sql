CREATE TYPE "public"."admin_role" AS ENUM('owner', 'staff_admin', 'teacher');--> statement-breakpoint
CREATE TYPE "public"."assignment_method" AS ENUM('lottery', 'manual_admin_override', 'manual_non_responder_placement');--> statement-breakpoint
CREATE TYPE "public"."grade" AS ENUM('senior', 'junior', 'sophomore', 'freshman');--> statement-breakpoint
CREATE TABLE "admin_roles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"role" "admin_role" NOT NULL,
	"trip_id" uuid,
	CONSTRAINT "admin_roles_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "assignment_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"wave" integer NOT NULL,
	"snapshot_at" timestamp with time zone DEFAULT now() NOT NULL,
	"data" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"student_email" text NOT NULL,
	"trip_id" uuid NOT NULL,
	"assigned_at" timestamp with time zone DEFAULT now() NOT NULL,
	"assignment_method" "assignment_method" NOT NULL,
	CONSTRAINT "assignments_student_email_unique" UNIQUE("student_email")
);
--> statement-breakpoint
CREATE TABLE "change_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"who" text NOT NULL,
	"action" text NOT NULL,
	"student_email" text,
	"from_trip" text,
	"to_trip" text,
	"timestamp" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "event_config" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"current_senior_grad_year" integer NOT NULL,
	"roster_reveal_at" timestamp with time zone,
	"change_request_window_ends_at" timestamp with time zone,
	"final_lock_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "roster" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"grade" "grade" NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "roster_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "submissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"student_email" text NOT NULL,
	"trip_choice_1" uuid,
	"trip_choice_2" uuid,
	"trip_choice_3" uuid,
	"trip_choice_4" uuid,
	"opted_out" boolean DEFAULT false NOT NULL,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_edited_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "submissions_student_email_unique" UNIQUE("student_email")
);
--> statement-breakpoint
CREATE TABLE "trips" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"capacity" integer NOT NULL,
	"chaperone_teacher_email" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "waivers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"student_email" text NOT NULL,
	"storage_path" text NOT NULL,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "waivers_student_email_unique" UNIQUE("student_email")
);
--> statement-breakpoint
CREATE TABLE "wave_schedule" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"wave" integer NOT NULL,
	"grade" "grade" NOT NULL,
	"opens_at" timestamp with time zone NOT NULL,
	"closes_at" timestamp with time zone NOT NULL,
	"sorted_at" timestamp with time zone,
	CONSTRAINT "wave_schedule_wave_unique" UNIQUE("wave")
);
--> statement-breakpoint
ALTER TABLE "admin_roles" ADD CONSTRAINT "admin_roles_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_student_email_roster_email_fk" FOREIGN KEY ("student_email") REFERENCES "public"."roster"("email") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_student_email_roster_email_fk" FOREIGN KEY ("student_email") REFERENCES "public"."roster"("email") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_trip_choice_1_trips_id_fk" FOREIGN KEY ("trip_choice_1") REFERENCES "public"."trips"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_trip_choice_2_trips_id_fk" FOREIGN KEY ("trip_choice_2") REFERENCES "public"."trips"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_trip_choice_3_trips_id_fk" FOREIGN KEY ("trip_choice_3") REFERENCES "public"."trips"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_trip_choice_4_trips_id_fk" FOREIGN KEY ("trip_choice_4") REFERENCES "public"."trips"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "waivers" ADD CONSTRAINT "waivers_student_email_roster_email_fk" FOREIGN KEY ("student_email") REFERENCES "public"."roster"("email") ON DELETE cascade ON UPDATE no action;
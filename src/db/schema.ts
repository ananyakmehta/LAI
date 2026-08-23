import {
  pgTable,
  pgEnum,
  uuid,
  text,
  integer,
  boolean,
  timestamp,
  jsonb,
  unique,
} from "drizzle-orm/pg-core";

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const gradeEnum = pgEnum("grade", [
  "senior",
  "junior",
  "sophomore",
  "freshman",
]);

export const adminRoleEnum = pgEnum("admin_role", [
  "owner",
  "staff_admin",
  "teacher",
]);

export const assignmentMethodEnum = pgEnum("assignment_method", [
  "lottery",
  "manual_admin_override",
  "manual_non_responder_placement",
]);

// ---------------------------------------------------------------------------
// Core tables (DD_LAI_init_build.md §4)
// ---------------------------------------------------------------------------

// The master list of every student — single source of truth for who can log
// in and the denominator for non-responder tracking (roster MINUS submissions).
// Imported once (or once per year) via the `import-roster` CLI command.
export const roster = pgTable("roster", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  grade: gradeEnum("grade").notNull(),
  notes: text("notes").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const trips = pgTable("trips", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  capacity: integer("capacity").notNull(),
  // seats_filled / seats_remaining are deliberately NOT columns here — they
  // are always computed by counting `assignments` rows, so they can never
  // drift out of sync with reality (§4).
  chaperoneTeacherEmail: text("chaperone_teacher_email"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// One row per student, overwritten on edit (not append-only — only the
// current answer matters). Choices reference trips; nulls are allowed so a
// student can be mid-edit or have fewer than 4 choices filled in before
// submitting, though the UI should require all 4 (or opted_out) before save.
export const submissions = pgTable("submissions", {
  id: uuid("id").primaryKey().defaultRandom(),
  studentEmail: text("student_email")
    .notNull()
    .unique()
    .references(() => roster.email, { onDelete: "cascade" }),
  tripChoice1: uuid("trip_choice_1").references(() => trips.id, {
    onDelete: "restrict",
  }),
  tripChoice2: uuid("trip_choice_2").references(() => trips.id, {
    onDelete: "restrict",
  }),
  tripChoice3: uuid("trip_choice_3").references(() => trips.id, {
    onDelete: "restrict",
  }),
  tripChoice4: uuid("trip_choice_4").references(() => trips.id, {
    onDelete: "restrict",
  }),
  optedOut: boolean("opted_out").notNull().default(false),
  submittedAt: timestamp("submitted_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  lastEditedAt: timestamp("last_edited_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// The outcome, once computed. assignment_method distinguishes "the
// algorithm did this" from "the owner moved them" (§4), which matters for
// trust and for answering questions later.
export const assignments = pgTable("assignments", {
  id: uuid("id").primaryKey().defaultRandom(),
  studentEmail: text("student_email")
    .notNull()
    .unique()
    .references(() => roster.email, { onDelete: "cascade" }),
  tripId: uuid("trip_id")
    .notNull()
    .references(() => trips.id, { onDelete: "restrict" }),
  assignedAt: timestamp("assigned_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  assignmentMethod: assignmentMethodEnum("assignment_method").notNull(),
});

// Append-only audit trail. Every manual action (move, override, re-sort) is
// attributed here — this is what makes giving the owner unrestricted
// override power safe rather than reckless (§4).
export const changeLog = pgTable("change_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  who: text("who").notNull(),
  action: text("action").notNull(),
  studentEmail: text("student_email"),
  fromTrip: text("from_trip"),
  toTrip: text("to_trip"),
  timestamp: timestamp("timestamp", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// Access control — editable only by the owner account (§6). tripId is only
// relevant for the `teacher` role.
export const adminRoles = pgTable("admin_roles", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  role: adminRoleEnum("role").notNull(),
  tripId: uuid("trip_id").references(() => trips.id, { onDelete: "set null" }),
});

// ---------------------------------------------------------------------------
// Supporting tables — required by requirements stated elsewhere in the doc
// that the original 6-table list (§4) didn't give a home to. See the build
// plan's "Data model" section for the reasoning behind each.
// ---------------------------------------------------------------------------

// Configurable wave dates/times (owner asked for this explicitly — not
// hardcoded Mon/Tue/Wed/Thu per §5's table). The cron job reads this to know
// which wave just closed and hasn't been sorted yet.
export const waveSchedule = pgTable(
  "wave_schedule",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    wave: integer("wave").notNull(), // 1-4
    grade: gradeEnum("grade").notNull(),
    opensAt: timestamp("opens_at", { withTimezone: true }).notNull(),
    closesAt: timestamp("closes_at", { withTimezone: true }).notNull(),
    sortedAt: timestamp("sorted_at", { withTimezone: true }),
  },
  (table) => [unique().on(table.wave)],
);

// Single-row config table for the three post-wave phases (§5) and the
// grade-derivation anchor (§7). A single row keyed by a fixed id so the app
// can always `SELECT * FROM event_config LIMIT 1`.
export const eventConfig = pgTable("event_config", {
  id: integer("id").primaryKey().default(1),
  currentSeniorGradYear: integer("current_senior_grad_year").notNull(),
  rosterRevealAt: timestamp("roster_reveal_at", { withTimezone: true }),
  changeRequestWindowEndsAt: timestamp("change_request_window_ends_at", {
    withTimezone: true,
  }),
  finalLockAt: timestamp("final_lock_at", { withTimezone: true }),
});

// §3 requires two independently-tracked completion flags per student —
// ranked their trips, and uploaded a waiver. Ranking status is derivable
// from `submissions`; this table is where waiver status lives.
export const waivers = pgTable("waivers", {
  id: uuid("id").primaryKey().defaultRandom(),
  studentEmail: text("student_email")
    .notNull()
    .unique()
    .references(() => roster.email, { onDelete: "cascade" }),
  storagePath: text("storage_path").notNull(),
  uploadedAt: timestamp("uploaded_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// §10 requires `run-sort` re-runs to be "recoverable in spirit" — snapshot
// the prior assignments for a wave before overwriting them.
export const assignmentSnapshots = pgTable("assignment_snapshots", {
  id: uuid("id").primaryKey().defaultRandom(),
  wave: integer("wave").notNull(),
  snapshotAt: timestamp("snapshot_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  data: jsonb("data").notNull(),
});

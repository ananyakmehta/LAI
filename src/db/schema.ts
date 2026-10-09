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
  // Display-only trip-day logistics, shown to students on the picker and
  // again (with the rest of the trip card) once assignments are released —
  // separate from chaperoneTeacherEmail, which is the admin-login identity
  // for the teacher tier, not necessarily the same as the catalog's named
  // faculty lead(s).
  facultyLead: text("faculty_lead"),
  startTime: text("start_time"),
  endTime: text("end_time"),
  travelMethod: text("travel_method"),
  // Waivers are per-trip, not universal — some trips (rock climbing, etc.)
  // have their own release form hosted by the vendor, most don't need one
  // at all. waiverUrl/waiverDescription are only meaningful when
  // waiverRequired is true; see the waivers table below for how a
  // student's completion gets recorded.
  waiverRequired: boolean("waiver_required").notNull().default(false),
  waiverUrl: text("waiver_url"),
  waiverDescription: text("waiver_description"),
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
  // Collected alongside the ranking, regardless of opt-out status — a
  // contact for the trip day itself, not identity/login (that's the
  // student's own roster email).
  parentEmail: text("parent_email"),
  parentPhone: text("parent_phone"),
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
// hardcoded Mon/Tue/Wed/Thu per §5's table).
//
// closesAt is that GRADE'S OWN priority deadline, not a hard submission
// cutoff — per the real 2026 event rules, seniors/juniors can still submit
// after their own closesAt, right up to the shared eventConfig.
// finalSubmissionDeadline below, they just lose grade-level priority and
// fall into the second (merged) sort pass instead of the first. Only
// sophomores/freshmen have closesAt == the final deadline, since they were
// never given an earlier priority window to miss.
//
// sortedAt marks "has this grade's priority cohort been placed yet" — set
// by whichever sort pass processes that grade (see src/lib/lottery.ts's
// runLotteryPass1/runLotteryPass2), not by a per-grade independent sort.
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

// Single-row config table for the post-wave phases (§5) and the
// grade-derivation anchor (§7). A single row keyed by a fixed id so the app
// can always `SELECT * FROM event_config LIMIT 1`.
//
// No roster-reveal date here, deliberately: the school decided students
// must never see the names of who else is on their trip, at any point
// (DD_LAI_ui_spec.md §0) — don't re-add a reveal-phase timestamp.
export const eventConfig = pgTable("event_config", {
  id: integer("id").primaryKey().default(1),
  currentSeniorGradYear: integer("current_senior_grad_year").notNull(),
  changeRequestWindowEndsAt: timestamp("change_request_window_ends_at", {
    withTimezone: true,
  }),
  finalLockAt: timestamp("final_lock_at", { withTimezone: true }),
  // The one real hard stop on submissions, shared by every grade — a
  // senior/junior submitting after their own wave_schedule.closesAt (their
  // priority deadline) is still accepted up until this timestamp, just
  // without priority. Sophomores/freshmen never have an earlier deadline
  // to lose, so this IS effectively their wave's closesAt too.
  finalSubmissionDeadline: timestamp("final_submission_deadline", {
    withTimezone: true,
  }),
  // Sorting itself runs automatically per-wave (cron or manual "Sort"), but
  // students never see an assignment until the owner deliberately flips
  // this — a separate reveal step from computing the result. Null means
  // "not released yet"; set once, globally, for every grade at once.
  assignmentsReleasedAt: timestamp("assignments_released_at", {
    withTimezone: true,
  }),
});

// §3 requires two independently-tracked completion flags per student —
// ranked their trips, and completed a waiver. Ranking status is derivable
// from `submissions`; this table is where waiver status lives.
//
// Waivers aren't files we host — some trips have their own external
// release form (a vendor's own site), so a row here just means "this
// student says they've completed their assigned trip's waiver," not that
// we hold a copy of it. Keyed by (student, trip) rather than student alone
// so that moving a student to a different trip doesn't carry over an
// acknowledgment that was for a different trip's requirement — the old
// row simply becomes irrelevant, and the new trip has none until they
// check the box again.
export const waivers = pgTable(
  "waivers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    studentEmail: text("student_email")
      .notNull()
      .references(() => roster.email, { onDelete: "cascade" }),
    tripId: uuid("trip_id")
      .notNull()
      .references(() => trips.id, { onDelete: "cascade" }),
    acknowledgedAt: timestamp("acknowledged_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [unique().on(table.studentEmail, table.tripId)],
);

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

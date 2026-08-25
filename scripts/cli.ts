import { readFileSync } from "node:fs";
import { parse } from "csv-parse/sync";
import { Command } from "commander";
import { eq } from "drizzle-orm";
import { db, resolveTrip, confirm, ownerIdentity } from "./lib";
import {
  roster,
  assignments,
  changeLog,
  trips,
  waveSchedule,
  eventConfig,
} from "../src/db/schema";
import { runLotteryForWave } from "../src/lib/lottery";
import { getTripFillStatus, moveStudentToTrip } from "../src/db/queries/moves";
import { grantRole, revokeRole, type GrantableRole } from "../src/db/queries/access";
import type { Grade } from "../src/lib/grade";

const program = new Command();

const WAVE_GRADE: Record<number, Grade> = {
  1: "senior",
  2: "junior",
  3: "sophomore",
  4: "freshman",
};

program
  .command("import-roster <csvPath>")
  .description("Load/update the master roster from a CSV (name,email,grade,notes)")
  .action(async (csvPath: string) => {
    const who = ownerIdentity();
    const raw = readFileSync(csvPath, "utf-8");
    const records: { name: string; email: string; grade: string; notes?: string }[] =
      parse(raw, { columns: true, skip_empty_lines: true, trim: true });

    if (records.length === 0) {
      console.error("No rows found in CSV.");
      process.exit(1);
    }

    await db.transaction(async (tx) => {
      for (const r of records) {
        const email = r.email.toLowerCase();
        const grade = r.grade.toLowerCase() as Grade;
        if (!["senior", "junior", "sophomore", "freshman"].includes(grade)) {
          throw new Error(`Invalid grade "${r.grade}" for ${email}`);
        }
        await tx
          .insert(roster)
          .values({ name: r.name, email, grade, notes: r.notes ?? "" })
          .onConflictDoUpdate({
            target: roster.email,
            set: { name: r.name, grade, notes: r.notes ?? "" },
          });
      }
      await tx.insert(changeLog).values({
        who,
        action: "import_roster",
        toTrip: `${records.length}_rows`,
      });
    });

    console.log(`Imported/updated ${records.length} roster rows.`);
  });

program
  .command("move-student <email> <trip>")
  .description("Reassign a student to a trip (checks capacity, warns on overbook)")
  .option("--force", "skip the overbook confirmation prompt")
  .action(async (email: string, tripArg: string, opts: { force?: boolean }) => {
    const who = ownerIdentity();
    email = email.toLowerCase();

    const [studentRow] = await db.select().from(roster).where(eq(roster.email, email)).limit(1);
    if (!studentRow) {
      console.error(`${email} is not on the roster.`);
      process.exit(1);
    }

    const trip = await resolveTrip(tripArg);
    const status = await getTripFillStatus(trip.id);
    if (!status) {
      console.error(`Trip ${trip.id} not found.`);
      process.exit(1);
    }

    if (status.filled >= status.trip.capacity && !opts.force) {
      const proceed = await confirm(
        `${trip.name} is at capacity (${status.filled}/${status.trip.capacity}). Overbook anyway?`,
      );
      if (!proceed) {
        console.log("Cancelled.");
        return;
      }
    }

    await moveStudentToTrip(email, trip.id, who);

    console.log(`Moved ${email} to ${trip.name}.`);
  });

program
  .command("assign-non-responder <email> <trip>")
  .description("Manually place a non-responder (surfaces their roster notes first)")
  .option("--force", "skip the overbook confirmation prompt")
  .action(async (email: string, tripArg: string, opts: { force?: boolean }) => {
    const who = ownerIdentity();
    email = email.toLowerCase();

    const [studentRow] = await db.select().from(roster).where(eq(roster.email, email)).limit(1);
    if (!studentRow) {
      console.error(`${email} is not on the roster.`);
      process.exit(1);
    }

    console.log(`Notes for ${studentRow.name} (${email}): ${studentRow.notes || "(none)"}`);

    const trip = await resolveTrip(tripArg);
    const currentAssignments = await db.select().from(assignments).where(eq(assignments.tripId, trip.id));

    if (currentAssignments.length >= trip.capacity && !opts.force) {
      const proceed = await confirm(
        `${trip.name} is at capacity (${currentAssignments.length}/${trip.capacity}). Overbook anyway?`,
      );
      if (!proceed) {
        console.log("Cancelled.");
        return;
      }
    }

    await db.transaction(async (tx) => {
      await tx.insert(assignments).values({
        studentEmail: email,
        tripId: trip.id,
        assignmentMethod: "manual_non_responder_placement",
      });
      await tx.insert(changeLog).values({
        who,
        action: "assign_non_responder",
        studentEmail: email,
        toTrip: trip.id,
      });
    });

    console.log(`Placed ${email} on ${trip.name}.`);
  });

program
  .command("run-sort <wave>")
  .description("Manually trigger the lottery for a wave (1-4). Snapshots prior assignments first.")
  .action(async (waveArg: string) => {
    const who = ownerIdentity();
    const wave = Number(waveArg);
    if (!WAVE_GRADE[wave]) {
      console.error("Wave must be 1, 2, 3, or 4.");
      process.exit(1);
    }
    const result = await runLotteryForWave(wave, who);
    console.log(
      `Wave ${wave}: ${result.assignedCount} assigned, ${result.unplacedCount} unplaced out of ${result.eligibleCount} eligible.`,
    );
  });

program
  .command("set-capacity <trip> <n>")
  .description("Edit a trip's seat count")
  .action(async (tripArg: string, nArg: string) => {
    const who = ownerIdentity();
    const n = Number(nArg);
    if (!Number.isInteger(n) || n < 0) {
      console.error("Capacity must be a non-negative integer.");
      process.exit(1);
    }
    const trip = await resolveTrip(tripArg);
    const currentAssignments = await db.select().from(assignments).where(eq(assignments.tripId, trip.id));
    if (n < currentAssignments.length) {
      console.warn(
        `Warning: new capacity (${n}) is below current seats filled (${currentAssignments.length}).`,
      );
    }

    await db.transaction(async (tx) => {
      await tx.update(trips).set({ capacity: n }).where(eq(trips.id, trip.id));
      await tx.insert(changeLog).values({
        who,
        action: "set_capacity",
        toTrip: `${trip.name}:${n}`,
      });
    });

    console.log(`${trip.name} capacity set to ${n}.`);
  });

program
  .command("grant-role <email> <role> [trip]")
  .description("Grant/revoke owner/staff_admin/teacher access (owner's own credential = owner-only in practice)")
  .action(async (email: string, role: string, tripArg?: string) => {
    const who = ownerIdentity();
    email = email.toLowerCase();
    if (!["owner", "staff_admin", "teacher"].includes(role)) {
      console.error("Role must be owner, staff_admin, or teacher.");
      process.exit(1);
    }

    let tripId: string | null = null;
    if (role === "teacher") {
      if (!tripArg) {
        console.error("Teacher role requires a trip argument.");
        process.exit(1);
      }
      const trip = await resolveTrip(tripArg);
      tripId = trip.id;
    }

    await grantRole(email, role as GrantableRole, tripId, who);

    console.log(`Granted ${role} to ${email}${tripId ? ` (trip ${tripId})` : ""}.`);
  });

program
  .command("revoke-role <email>")
  .description("Remove an email's owner/staff_admin/teacher access")
  .action(async (email: string) => {
    const who = ownerIdentity();
    email = email.toLowerCase();
    const revoked = await revokeRole(email, who);
    if (!revoked) {
      console.error(`${email} has no admin_roles entry.`);
      process.exit(1);
    }
    console.log(`Revoked access for ${email}.`);
  });

program
  .command("set-wave <wave> <opensAt> <closesAt>")
  .description("Set a wave's open/close timestamps (ISO 8601, e.g. 2026-09-14T08:00:00-07:00)")
  .action(async (waveArg: string, opensAtArg: string, closesAtArg: string) => {
    const who = ownerIdentity();
    const wave = Number(waveArg);
    const grade = WAVE_GRADE[wave];
    if (!grade) {
      console.error("Wave must be 1, 2, 3, or 4.");
      process.exit(1);
    }
    const opensAt = new Date(opensAtArg);
    const closesAt = new Date(closesAtArg);
    if (Number.isNaN(opensAt.getTime()) || Number.isNaN(closesAt.getTime())) {
      console.error("Could not parse the given timestamps — use ISO 8601.");
      process.exit(1);
    }

    await db.transaction(async (tx) => {
      await tx
        .insert(waveSchedule)
        .values({ wave, grade, opensAt, closesAt })
        .onConflictDoUpdate({ target: waveSchedule.wave, set: { opensAt, closesAt } });
      await tx.insert(changeLog).values({
        who,
        action: "set_wave",
        toTrip: `wave_${wave}:${opensAt.toISOString()}..${closesAt.toISOString()}`,
      });
    });

    console.log(`Wave ${wave} (${grade}) set: opens ${opensAt.toISOString()}, closes ${closesAt.toISOString()}.`);
  });

program
  .command("set-event-dates")
  .description("Set change-request-window-end / final-lock dates")
  .option("--change-window-end <iso>", "change-request window end timestamp")
  .option("--final-lock <iso>", "final lock timestamp (UI-copy only, per §5)")
  .action(async (opts: { changeWindowEnd?: string; finalLock?: string }) => {
    const who = ownerIdentity();
    const [existing] = await db.select().from(eventConfig).limit(1);
    if (!existing) {
      console.error("No event_config row yet — run `npm run seed:owner` first.");
      process.exit(1);
    }

    const update: Record<string, Date> = {};
    if (opts.changeWindowEnd) update.changeRequestWindowEndsAt = new Date(opts.changeWindowEnd);
    if (opts.finalLock) update.finalLockAt = new Date(opts.finalLock);

    if (Object.keys(update).length === 0) {
      console.error("Pass at least one of --change-window-end, --final-lock.");
      process.exit(1);
    }

    await db.transaction(async (tx) => {
      await tx.update(eventConfig).set(update).where(eq(eventConfig.id, existing.id));
      await tx.insert(changeLog).values({
        who,
        action: "set_event_dates",
        toTrip: JSON.stringify(update),
      });
    });

    console.log("Updated event_config:", update);
  });

program.parseAsync(process.argv).then(() => process.exit(0));

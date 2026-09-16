import { parse } from "csv-parse/sync";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { roster, changeLog } from "@/db/schema";
import type { Grade } from "@/lib/grade";

export async function getRosterByEmail(email: string) {
  const [row] = await db
    .select()
    .from(roster)
    .where(eq(roster.email, email))
    .limit(1);
  return row ?? null;
}

export async function getRosterByGrade(grade: Grade) {
  return db.select().from(roster).where(eq(roster.grade, grade));
}

const VALID_GRADES = ["senior", "junior", "sophomore", "freshman"];

/**
 * The one shared roster-import implementation — used by the CLI's
 * `import-roster` and the admin dashboard's roster-upload UI, same
 * reasoning as moves.ts/access.ts: exactly one code path writes roster +
 * change_log rows for an import, so the two surfaces can't drift.
 *
 * This is the canonical list non-responders are checked against — a
 * student who never signs in still needs to show up here, otherwise
 * they're invisible to non-responder tracking rather than flagged.
 */
export async function importRosterFromCsv(csvText: string, who: string): Promise<number> {
  const records: { name: string; email: string; grade: string; notes?: string }[] = parse(
    csvText,
    { columns: true, skip_empty_lines: true, trim: true },
  );

  if (records.length === 0) {
    throw new Error("No rows found in CSV.");
  }

  await db.transaction(async (tx) => {
    for (const r of records) {
      const email = r.email.toLowerCase();
      const grade = r.grade.toLowerCase() as Grade;
      if (!VALID_GRADES.includes(grade)) {
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

  return records.length;
}

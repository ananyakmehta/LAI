import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { submissions } from "@/db/schema";

export async function getSubmissionForStudent(email: string) {
  const [row] = await db
    .select()
    .from(submissions)
    .where(eq(submissions.studentEmail, email))
    .limit(1);
  return row ?? null;
}

export interface SubmissionInput {
  optedOut: boolean;
  tripChoice1: string | null;
  tripChoice2: string | null;
  tripChoice3: string | null;
  tripChoice4: string | null;
  parent1Email: string | null;
  parent1Phone: string | null;
  parent2Email: string | null;
  parent2Phone: string | null;
}

/**
 * One row per student, overwritten on edit — not append-only, only the
 * current answer matters (§4). Safe under concurrent submissions from
 * different students by construction: each student only ever touches their
 * own row (unique on student_email), so there's no shared mutable state for
 * two requests to race over (the whole point of §1's architectural fix).
 */
export async function upsertSubmission(email: string, input: SubmissionInput) {
  const now = new Date();
  await db
    .insert(submissions)
    .values({
      studentEmail: email,
      ...input,
      submittedAt: now,
      lastEditedAt: now,
    })
    .onConflictDoUpdate({
      target: submissions.studentEmail,
      set: { ...input, lastEditedAt: now },
    });
}

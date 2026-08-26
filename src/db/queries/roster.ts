import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { roster } from "@/db/schema";
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

import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { waivers } from "@/db/schema";

export async function getWaiverForStudent(email: string) {
  const [row] = await db
    .select()
    .from(waivers)
    .where(eq(waivers.studentEmail, email))
    .limit(1);
  return row ?? null;
}

export async function upsertWaiver(email: string, storagePath: string) {
  await db
    .insert(waivers)
    .values({ studentEmail: email, storagePath, uploadedAt: new Date() })
    .onConflictDoUpdate({
      target: waivers.studentEmail,
      set: { storagePath, uploadedAt: new Date() },
    });
}

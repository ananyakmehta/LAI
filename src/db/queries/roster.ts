import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { roster } from "@/db/schema";

export async function getRosterByEmail(email: string) {
  const [row] = await db
    .select()
    .from(roster)
    .where(eq(roster.email, email))
    .limit(1);
  return row ?? null;
}

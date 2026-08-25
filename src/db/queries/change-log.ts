import { desc } from "drizzle-orm";
import { db } from "@/db/client";
import { changeLog } from "@/db/schema";

export async function getRecentChangeLog(limit = 50) {
  return db.select().from(changeLog).orderBy(desc(changeLog.timestamp)).limit(limit);
}

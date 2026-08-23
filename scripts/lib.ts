import "dotenv/config";
import { createInterface } from "node:readline/promises";
import { eq, ilike } from "drizzle-orm";
import { db } from "../src/db/client";
import { trips } from "../src/db/schema";

export { db };

export async function resolveTrip(arg: string) {
  const byId = /^[0-9a-f-]{36}$/i.test(arg)
    ? (await db.select().from(trips).where(eq(trips.id, arg)).limit(1))[0]
    : undefined;
  if (byId) return byId;

  const byName = await db.select().from(trips).where(ilike(trips.name, arg)).limit(1);
  if (byName[0]) return byName[0];

  throw new Error(`No trip found matching "${arg}" (tried id and exact name).`);
}

export async function confirm(question: string): Promise<boolean> {
  if (!process.stdin.isTTY) {
    console.error(
      `${question} — not running interactively; pass --force to proceed without confirming.`,
    );
    return false;
  }
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question(`${question} [y/N] `);
  rl.close();
  return answer.trim().toLowerCase() === "y";
}

export function ownerIdentity(): string {
  const who = process.env.OWNER_EMAIL;
  if (!who) {
    throw new Error(
      "No identity to attribute this change to — set OWNER_EMAIL in .env.",
    );
  }
  return who;
}

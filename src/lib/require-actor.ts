import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getActor, type Actor, type Role } from "@/lib/permissions";

export async function requireActor(): Promise<Actor> {
  const session = await auth();
  if (!session?.user?.email) redirect("/");
  return getActor(session.user.email);
}

export async function requireRole(...allowed: Role[]): Promise<Actor> {
  const actor = await requireActor();
  if (!allowed.includes(actor.role)) redirect("/");
  return actor;
}

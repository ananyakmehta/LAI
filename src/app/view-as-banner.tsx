import { cookies } from "next/headers";
import { getViewContext, VIEW_AS_COOKIE } from "@/lib/view-context";
import { getTripById } from "@/db/queries/trips";

/**
 * Always present when a "view as" simulation is active, regardless of what
 * page is being rendered below — this is what prevents a lockout. Once
 * simulating "student," /admin redirects away (its gate checks the
 * effective role), so this banner is the only way back to the owner's own
 * view; it can't live inside a page that a simulated non-owner role would
 * never reach.
 */
export async function ViewAsBanner() {
  const ctx = await getViewContext();
  if (!ctx?.simulated) return null;

  const label = await describeSimulation(ctx.role, ctx.email, ctx.teacherTripId);

  return (
    <div className="flex items-center justify-between bg-amber-100 px-4 py-2 text-sm text-amber-900">
      <span>Viewing as: {label}</span>
      <form
        action={async () => {
          "use server";
          const store = await cookies();
          store.delete(VIEW_AS_COOKIE);
        }}
      >
        <button type="submit" className="underline">
          Exit simulation
        </button>
      </form>
    </div>
  );
}

async function describeSimulation(
  role: string,
  email: string,
  teacherTripId: string | null,
): Promise<string> {
  if (role === "student") return `Student (${email})`;
  if (role === "teacher") {
    const trip = teacherTripId ? await getTripById(teacherTripId) : null;
    return `Teacher (${trip?.name ?? "unknown trip"})`;
  }
  return "Staff-admin";
}

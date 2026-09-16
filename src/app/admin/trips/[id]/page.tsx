import { redirect } from "next/navigation";
import { getViewContext } from "@/lib/view-context";
import { can, type Actor } from "@/lib/permissions";
import { getMasterOverview, getUnassignedNonResponders } from "@/db/queries/dashboard";
import { getTripById } from "@/db/queries/trips";
import { MoveNonRespondersPanel } from "./move-non-responders-panel";
import type { Grade } from "@/lib/grade";
import Link from "next/link";

const GRADES: Grade[] = ["senior", "junior", "sophomore", "freshman"];

export default async function TripRosterPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const ctx = await getViewContext();
  if (!ctx || (ctx.role !== "owner" && ctx.role !== "staff_admin")) {
    redirect("/");
  }
  const actor: Actor = { email: ctx.email, role: ctx.role, teacherTripId: ctx.teacherTripId };

  const { id: tripId } = await params;
  if (!can.viewNamesEmails(actor, tripId)) redirect("/admin");

  const trip = await getTripById(tripId);
  if (!trip) redirect("/admin");

  const rows = (await getMasterOverview(tripId)).filter(
    (r) => r.assignedTripId === tripId,
  );

  const canMove = can.moveAnyStudent(actor);
  const nonRespondersGrouped = canMove
    ? await Promise.all(GRADES.map(async (g) => ({ grade: g, rows: await getUnassignedNonResponders(g) })))
    : [];

  return (
    <main className="mx-auto flex max-w-2xl flex-1 flex-col gap-4 p-8">
      <Link href="/admin" className="text-sm text-plum/60 underline">
        &larr; back to dashboard
      </Link>
      <h1 className="text-2xl font-semibold text-plum">{trip.name}</h1>
      <p className="text-sm text-plum/70">
        {rows.length} / {trip.capacity} seats filled
      </p>

      <table className="w-full border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-petal">
            <th className="py-2 pr-4">Name</th>
            <th className="py-2 pr-4">Email</th>
            <th className="py-2 pr-4">Grade</th>
            <th className="py-2 pr-4">Waiver</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.email} className="border-b border-petal">
              <td className="py-2 pr-4">{row.name}</td>
              <td className="py-2 pr-4">{row.email}</td>
              <td className="py-2 pr-4">{row.grade}</td>
              <td className="py-2 pr-4">
                {row.waiverStatus === "n/a" ? "not required" : row.waiverStatus === "done" ? "done" : "pending"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {canMove && (
        <MoveNonRespondersPanel
          tripId={trip.id}
          tripName={trip.name}
          capacity={trip.capacity}
          filled={rows.length}
          nonResponders={nonRespondersGrouped}
        />
      )}
    </main>
  );
}

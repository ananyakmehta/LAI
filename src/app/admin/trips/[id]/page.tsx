import { redirect } from "next/navigation";
import { requireRole } from "@/lib/require-actor";
import { can } from "@/lib/permissions";
import { getMasterOverview } from "@/db/queries/dashboard";
import { getTripById } from "@/db/queries/trips";
import Link from "next/link";

export default async function TripRosterPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const actor = await requireRole("owner", "staff_admin", "teacher");
  const { id: tripId } = await params;

  if (!can.viewNamesEmails(actor, tripId)) redirect("/");

  const trip = await getTripById(tripId);
  if (!trip) redirect("/admin");

  const rows = (await getMasterOverview(tripId)).filter(
    (r) => r.assignedTripId === tripId,
  );

  return (
    <main className="mx-auto flex max-w-2xl flex-1 flex-col gap-4 p-8">
      <Link href="/" className="text-sm text-gray-500 underline">
        &larr; back
      </Link>
      <h1 className="text-2xl font-semibold">{trip.name}</h1>
      <p className="text-sm text-gray-600">
        {rows.length} / {trip.capacity} seats filled
      </p>

      <table className="w-full border-collapse text-left text-sm">
        <thead>
          <tr className="border-b">
            <th className="py-2">Name</th>
            <th className="py-2">Email</th>
            <th className="py-2">Grade</th>
            <th className="py-2">Waiver</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.email} className="border-b">
              <td className="py-2">{row.name}</td>
              <td className="py-2">{row.email}</td>
              <td className="py-2">{row.grade}</td>
              <td className="py-2">{row.waiverUploadedAt ? "uploaded" : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}

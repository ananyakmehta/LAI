import { getMasterOverview } from "@/db/queries/dashboard";
import { getTripById, getTripsWithCounts } from "@/db/queries/trips";

export async function TeacherHome({ tripId }: { tripId: string | null }) {
  if (!tripId) {
    return (
      <section>
        <p className="text-sm text-gray-600">You haven&apos;t been assigned a trip yet.</p>
      </section>
    );
  }

  const [trip, roster, allTrips] = await Promise.all([
    getTripById(tripId),
    getMasterOverview(tripId),
    getTripsWithCounts(),
  ]);

  if (!trip) {
    return (
      <section>
        <p className="text-sm text-gray-600">You haven&apos;t been assigned a trip yet.</p>
      </section>
    );
  }

  const ownRoster = roster.filter((r) => r.assignedTripId === tripId);

  return (
    <div className="flex flex-col gap-6">
      <section>
        <h2 className="text-lg font-semibold">{trip.name}</h2>
        <p className="mb-3 text-sm text-gray-600">
          {ownRoster.length} / {trip.capacity} confirmed
        </p>
        <table className="w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-b">
              <th className="py-2 pr-4">Name</th>
              <th className="py-2 pr-4">Email</th>
              <th className="py-2 pr-4">Waiver</th>
            </tr>
          </thead>
          <tbody>
            {ownRoster.map((r) => (
              <tr key={r.email} className="border-b">
                <td className="py-2 pr-4">{r.name}</td>
                <td className="py-2 pr-4">{r.email}</td>
                <td className="py-2 pr-4">{r.waiverUploadedAt ? "uploaded" : "not yet"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section>
        <h2 className="text-sm font-semibold">Other trips</h2>
        <ul className="text-sm text-gray-600">
          {allTrips
            .filter((t) => t.id !== tripId)
            .map((t) => (
              <li key={t.id}>
                {t.name}: {t.seatsRemaining}/{t.capacity} seats remaining
              </li>
            ))}
        </ul>
      </section>
    </div>
  );
}

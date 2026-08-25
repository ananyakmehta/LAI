import { requireActor } from "@/lib/require-actor";
import { getTripsWithCounts } from "@/db/queries/trips";
import Link from "next/link";

export default async function TripsPage() {
  await requireActor();
  const trips = await getTripsWithCounts();

  return (
    <main className="mx-auto flex max-w-2xl flex-1 flex-col gap-4 p-8">
      <Link href="/" className="text-sm text-gray-500 underline">
        &larr; back
      </Link>
      <h1 className="text-2xl font-semibold">Trips</h1>
      <p className="text-sm text-gray-600">
        Remaining-seat counts only — who else has claimed a seat isn&apos;t
        shown here.
      </p>
      <table className="w-full border-collapse text-left text-sm">
        <thead>
          <tr className="border-b">
            <th className="py-2 pr-4">Trip</th>
            <th className="py-2 pr-4">Description</th>
            <th className="py-2 pr-4">Seats remaining</th>
          </tr>
        </thead>
        <tbody>
          {trips.map((trip) => (
            <tr key={trip.id} className="border-b">
              <td className="py-2 font-medium">{trip.name}</td>
              <td className="py-2 text-gray-600">{trip.description}</td>
              <td className="py-2 pr-4">
                {trip.seatsRemaining} / {trip.capacity}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}

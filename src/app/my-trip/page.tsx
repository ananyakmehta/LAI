import { requireActor } from "@/lib/require-actor";
import { getEventConfig } from "@/db/queries/event-config";
import { getOwnAssignment, getTripRosterNames } from "@/db/queries/assignments";
import Link from "next/link";

export default async function MyTripPage() {
  const actor = await requireActor();
  const eventConfig = await getEventConfig();

  const revealed =
    eventConfig.rosterRevealAt !== null &&
    eventConfig.rosterRevealAt <= new Date();

  const assignment = await getOwnAssignment(actor.email);

  return (
    <main className="mx-auto flex max-w-2xl flex-1 flex-col gap-4 p-8">
      <Link href="/" className="text-sm text-gray-500 underline">
        &larr; back
      </Link>
      <h1 className="text-2xl font-semibold">My trip</h1>

      {!assignment && (
        <p className="text-sm text-gray-600">
          You haven&apos;t been assigned to a trip yet.
        </p>
      )}

      {assignment && (
        <>
          <p className="text-lg font-medium">{assignment.tripName}</p>
          {!revealed && (
            <p className="text-sm text-gray-600">
              Who else is on this trip will be visible here after the roster
              reveal date.
            </p>
          )}
          {revealed && <TripRoster tripId={assignment.tripId} />}
        </>
      )}
    </main>
  );
}

async function TripRoster({ tripId }: { tripId: string }) {
  const names = await getTripRosterNames(tripId);
  return (
    <ul className="list-inside list-disc text-sm">
      {names.map((name) => (
        <li key={name}>{name}</li>
      ))}
    </ul>
  );
}

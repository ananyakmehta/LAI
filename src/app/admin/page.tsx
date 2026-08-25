import { redirect } from "next/navigation";
import { requireRole } from "@/lib/require-actor";
import { can } from "@/lib/permissions";
import { getMasterOverview, getNonResponders, getUnplacedSubmitters } from "@/db/queries/dashboard";
import { getTripsWithCounts } from "@/db/queries/trips";
import { RosterRowActions } from "./roster-row-actions";
import type { Grade } from "@/lib/grade";
import Link from "next/link";

const GRADES: Grade[] = ["senior", "junior", "sophomore", "freshman"];

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ grade?: string; status?: string }>;
}) {
  const actor = await requireRole("owner", "staff_admin", "teacher");

  // Teachers only ever see their own trip — send them straight there.
  if (actor.role === "teacher") {
    if (!actor.teacherTripId) redirect("/");
    redirect(`/admin/trips/${actor.teacherTripId}`);
  }

  const { grade, status } = await searchParams;
  const rows = (await getMasterOverview()).filter((row) => {
    if (grade && row.grade !== grade) return false;
    if (status && row.submissionStatus !== status) return false;
    return true;
  });

  const showNonResponders = can.viewNonResponders(actor);
  const nonResponders = showNonResponders
    ? await Promise.all(GRADES.map((g) => getNonResponders(g)))
    : [];
  const unplaced = showNonResponders
    ? await Promise.all(GRADES.map((g) => getUnplacedSubmitters(g)))
    : [];

  const canMove = can.moveAnyStudent(actor);
  const tripOptions = canMove ? await getTripsWithCounts() : [];

  return (
    <main className="mx-auto flex max-w-5xl flex-1 flex-col gap-6 p-8">
      <Link href="/" className="text-sm text-gray-500 underline">
        &larr; back
      </Link>
      <h1 className="text-2xl font-semibold">Admin dashboard</h1>

      <form className="flex flex-wrap items-end gap-3 text-sm" method="get">
        <label className="flex flex-col gap-1">
          Grade
          <select name="grade" defaultValue={grade ?? ""} className="rounded border p-1">
            <option value="">All</option>
            {GRADES.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          Submission status
          <select name="status" defaultValue={status ?? ""} className="rounded border p-1">
            <option value="">All</option>
            <option value="none">Not submitted</option>
            <option value="submitted">Submitted</option>
            <option value="opted_out">Opted out</option>
          </select>
        </label>
        <button type="submit" className="rounded border px-3 py-1">
          Filter
        </button>
        <a
          className="rounded border px-3 py-1"
          href={`/api/admin/roster-export`}
        >
          Export CSV
        </a>
      </form>

      <table className="w-full border-collapse text-left text-sm">
        <thead>
          <tr className="border-b">
            <th className="py-2 pr-4">Name</th>
            <th className="py-2 pr-4">Email</th>
            <th className="py-2 pr-4">Grade</th>
            <th className="py-2 pr-4">Submission</th>
            <th className="py-2 pr-4">Waiver</th>
            <th className="py-2 pr-4">Assigned trip</th>
            {canMove && <th className="py-2 pr-4"></th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.email} className="border-b">
              <td className="py-2 pr-4">{row.name}</td>
              <td className="py-2 pr-4">{row.email}</td>
              <td className="py-2 pr-4">{row.grade}</td>
              <td className="py-2 pr-4">{row.submissionStatus}</td>
              <td className="py-2 pr-4">{row.waiverUploadedAt ? "uploaded" : "—"}</td>
              <td className="py-2 pr-4">{row.assignedTripName ?? "—"}</td>
              {canMove && (
                <td className="py-2 text-right">
                  <RosterRowActions
                    studentEmail={row.email}
                    currentTripId={row.assignedTripId}
                    trips={tripOptions}
                  />
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>

      {showNonResponders && (
        <>
          <section>
            <h2 className="text-lg font-semibold">
              Non-responders (need manual placement)
            </h2>
            {GRADES.map((g, i) => (
              <FlagList key={g} grade={g} rows={nonResponders[i]} />
            ))}
          </section>

          <section>
            <h2 className="text-lg font-semibold">
              Submitted but unplaced (all 4 choices were full)
            </h2>
            {GRADES.map((g, i) => (
              <FlagList key={g} grade={g} rows={unplaced[i]} />
            ))}
          </section>
        </>
      )}
    </main>
  );
}

function FlagList({
  grade,
  rows,
}: {
  grade: string;
  rows: { name: string; email: string; notes: string }[];
}) {
  if (rows.length === 0) return null;
  return (
    <div className="mt-2">
      <p className="text-sm font-medium capitalize">{grade}</p>
      <ul className="list-inside list-disc text-sm">
        {rows.map((r) => (
          <li key={r.email}>
            {r.name} ({r.email}){r.notes ? ` — notes: ${r.notes}` : ""}
          </li>
        ))}
      </ul>
    </div>
  );
}

import { redirect } from "next/navigation";
import { getViewContext, roleSimulationEnabled } from "@/lib/view-context";
import { can, type Actor } from "@/lib/permissions";
import { getMasterOverview, getNonResponders, getUnplacedSubmitters } from "@/db/queries/dashboard";
import { getTripsWithCounts } from "@/db/queries/trips";
import { getRecentChangeLog } from "@/db/queries/change-log";
import { getAdminRolesList } from "@/db/queries/access";
import { RosterRowActions } from "./roster-row-actions";
import { AccessManagement } from "./access-management";
import { ViewAsControl } from "./view-as-control";
import type { Grade } from "@/lib/grade";
import Link from "next/link";

const GRADES: Grade[] = ["senior", "junior", "sophomore", "freshman"];

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ grade?: string; status?: string }>;
}) {
  const ctx = await getViewContext();
  if (!ctx || (ctx.role !== "owner" && ctx.role !== "staff_admin")) {
    redirect("/");
  }

  // Every capability check below is on the EFFECTIVE role — this is what
  // makes "view as staff_admin" a real preview: the owner sees exactly
  // what staff_admin sees, including which sections don't exist at all,
  // not just greyed-out buttons. The underlying mutating API routes still
  // authorize off the real actor independently (see view-context.ts).
  const actor: Actor = { email: ctx.email, role: ctx.role, teacherTripId: ctx.teacherTripId };

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
  const tripOptions = await getTripsWithCounts();

  const isOwnerView = actor.role === "owner";
  const changeLog = isOwnerView ? await getRecentChangeLog(50) : [];
  const adminRoles = isOwnerView ? await getAdminRolesList() : [];

  const showViewAsControl = ctx.realActor.role === "owner" && !ctx.simulated && roleSimulationEnabled();

  return (
    <main className="mx-auto flex max-w-5xl flex-1 flex-col gap-8 p-8">
      <Link href="/" className="text-sm text-plum/60 underline">
        &larr; back
      </Link>
      <h1 className="text-2xl font-semibold text-plum">Admin dashboard</h1>

      {showViewAsControl && (
        <section>
          <h2 className="mb-2 text-lg font-semibold text-plum">View as</h2>
          <ViewAsControl
            rosterOptions={rows.map((r) => ({ email: r.email, name: r.name, grade: r.grade }))}
            trips={tripOptions}
          />
        </section>
      )}

      <section>
        <h2 className="mb-2 text-lg font-semibold text-plum">Roster overview</h2>
        <form className="mb-3 flex flex-wrap items-end gap-3 text-sm" method="get">
          <label className="flex flex-col gap-1">
            Grade
            <select name="grade" defaultValue={grade ?? ""} className="rounded border border-petal bg-white p-1">
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
            <select name="status" defaultValue={status ?? ""} className="rounded border border-petal bg-white p-1">
              <option value="">All</option>
              <option value="none">Not submitted</option>
              <option value="submitted">Submitted</option>
              <option value="opted_out">Opted out</option>
            </select>
          </label>
          <button type="submit" className="rounded border border-rose px-3 py-1 hover:bg-petal">
            Filter
          </button>
          <a className="rounded border border-rose px-3 py-1 hover:bg-petal" href={`/api/admin/roster-export`}>
            Export CSV
          </a>
        </form>

        <table className="w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-petal">
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
              <tr key={row.email} className="border-b border-petal">
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
      </section>

      <section>
        <h2 className="mb-2 text-lg font-semibold text-plum">Trips overview</h2>
        <table className="w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-petal">
              <th className="py-2 pr-4">Trip</th>
              <th className="py-2 pr-4">Filled</th>
              <th className="py-2 pr-4">Capacity</th>
              <th className="py-2 pr-4"></th>
            </tr>
          </thead>
          <tbody>
            {tripOptions.map((t) => (
              <tr key={t.id} className="border-b border-petal">
                <td className="py-2 pr-4">{t.name}</td>
                <td className="py-2 pr-4">{t.seatsFilled}</td>
                <td className="py-2 pr-4">{t.capacity}</td>
                <td className="py-2 pr-4">
                  <Link href={`/admin/trips/${t.id}`} className="text-plum underline">
                    View roster
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {showNonResponders && (
        <section>
          <h2 className="text-lg font-semibold text-plum">Actions</h2>
          <div className="mt-2">
            <h3 className="text-sm font-medium text-plum">Non-responders (need manual placement)</h3>
            {GRADES.map((g, i) => (
              <FlagList key={g} grade={g} rows={nonResponders[i]} />
            ))}
          </div>
          <div className="mt-4">
            <h3 className="text-sm font-medium text-plum">Submitted but unplaced (all 4 choices were full)</h3>
            {GRADES.map((g, i) => (
              <FlagList key={g} grade={g} rows={unplaced[i]} />
            ))}
          </div>

          {isOwnerView && (
            <div className="mt-4">
              <h3 className="text-sm font-medium text-plum">Change log</h3>
              <table className="w-full border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-petal">
                    <th className="py-2 pr-4">When</th>
                    <th className="py-2 pr-4">Who</th>
                    <th className="py-2 pr-4">Action</th>
                    <th className="py-2 pr-4">Student</th>
                    <th className="py-2 pr-4">From</th>
                    <th className="py-2 pr-4">To</th>
                  </tr>
                </thead>
                <tbody>
                  {changeLog.map((c) => (
                    <tr key={c.id} className="border-b border-petal">
                      <td className="py-2 pr-4">{c.timestamp.toLocaleString()}</td>
                      <td className="py-2 pr-4">{c.who}</td>
                      <td className="py-2 pr-4">{c.action}</td>
                      <td className="py-2 pr-4">{c.studentEmail ?? "—"}</td>
                      <td className="py-2 pr-4">{c.fromTrip ?? "—"}</td>
                      <td className="py-2 pr-4">{c.toTrip ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {isOwnerView && (
        <section>
          <h2 className="mb-2 text-lg font-semibold text-plum">Access management</h2>
          <AccessManagement roles={adminRoles} trips={tripOptions} />
        </section>
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
      <p className="text-sm font-medium capitalize text-plum">{grade}</p>
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

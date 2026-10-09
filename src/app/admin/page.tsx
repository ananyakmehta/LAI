import { redirect } from "next/navigation";
import { getViewContext, roleSimulationEnabled } from "@/lib/view-context";
import { can, type Actor } from "@/lib/permissions";
import {
  getMasterOverview,
  getUnassignedNonResponders,
  getOptedOut,
  getUnplacedSubmitters,
} from "@/db/queries/dashboard";
import { getTripsWithCounts } from "@/db/queries/trips";
import { getRecentChangeLog } from "@/db/queries/change-log";
import { getAdminRolesList } from "@/db/queries/access";
import { getEventConfig } from "@/db/queries/event-config";
import { RosterPanel } from "./roster-panel";
import { RosterImport } from "./roster-import";
import { HeightMatchedRow } from "./height-matched-row";
import { AccessManagement } from "./access-management";
import { ViewAsControl } from "./view-as-control";
import { SimulationPanel } from "./simulation-panel";
import { ReleaseAssignmentsControl } from "./release-assignments-control";
import { SortPassesControl } from "./sort-passes-control";
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
    ? await Promise.all(GRADES.map((g) => getUnassignedNonResponders(g)))
    : [];
  const optedOut = showNonResponders
    ? await Promise.all(GRADES.map((g) => getOptedOut(g)))
    : [];
  const unplaced = showNonResponders
    ? await Promise.all(GRADES.map((g) => getUnplacedSubmitters(g)))
    : [];

  const canMove = can.moveAnyStudent(actor);
  const tripOptions = await getTripsWithCounts();

  const isOwnerView = actor.role === "owner";
  const changeLog = isOwnerView ? await getRecentChangeLog(50) : [];
  const adminRoles = isOwnerView ? await getAdminRolesList() : [];
  const eventConfig = isOwnerView ? await getEventConfig() : null;

  const showViewAsControl = ctx.realActor.role === "owner" && !ctx.simulated && roleSimulationEnabled();
  const showSimulationPanel = ctx.realActor.role === "owner" && !ctx.simulated && roleSimulationEnabled();

  const nonRespondersGrouped = GRADES.map((g, i) => ({ grade: g, rows: nonResponders[i] ?? [] }));
  const optedOutGrouped = GRADES.map((g, i) => ({ grade: g, rows: optedOut[i] ?? [] }));
  const unplacedGrouped = GRADES.map((g, i) => ({ grade: g, rows: unplaced[i] ?? [] }));

  return (
    <main className="mx-auto flex w-full max-w-[1700px] flex-1 flex-col gap-8 px-6 py-8">
      <Link href="/" className="text-sm text-blush/60 underline">
        &larr; back
      </Link>
      <h1 className="text-2xl font-semibold text-blush">Admin dashboard</h1>

      {showViewAsControl && (
        <section>
          <h2 className="mb-2 text-lg font-semibold text-blush">View as</h2>
          <ViewAsControl
            rosterOptions={rows.map((r) => ({ email: r.email, name: r.name, grade: r.grade }))}
            trips={tripOptions}
          />
        </section>
      )}

      {can.importRosterCsv(actor) && (
        <section>
          <h2 className="mb-2 text-lg font-semibold text-blush">Master roster upload</h2>
          <RosterImport />
        </section>
      )}

      <section>
        <h2 className="mb-2 text-lg font-semibold text-blush">Roster overview</h2>
        <form className="mb-3 flex flex-wrap items-end gap-3 text-sm text-blush" method="get">
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

        <RosterPanel
          rows={rows}
          canMove={canMove}
          tripOptions={tripOptions}
          nonResponders={nonRespondersGrouped}
          optedOut={optedOutGrouped}
          unplaced={unplacedGrouped}
        />
      </section>

      <section>
        <h2 className="mb-2 text-lg font-semibold text-blush">Trips overview</h2>
        <table className="w-full border-collapse text-left text-sm text-blush">
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
                  <Link href={`/admin/trips/${t.id}`} className="text-blush underline">
                    View roster
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {isOwnerView && eventConfig && (
        <section>
          <h2 className="mb-2 text-lg font-semibold text-blush">Event operations</h2>
          <div className="flex flex-col gap-3">
            <SortPassesControl />
            <ReleaseAssignmentsControl
              releasedAt={eventConfig.assignmentsReleasedAt?.toISOString() ?? null}
            />
          </div>
        </section>
      )}

      {isOwnerView && (
        <section>
          <h2 className="mb-2 text-lg font-semibold text-blush">Screen preview</h2>
          <p className="mb-2 text-sm text-blush/70">
            Click through every student-facing screen with sample data — writes nothing to the
            database, so it&rsquo;s safe to use on real data.
          </p>
          <Link
            href="/admin/preview"
            className="inline-block rounded border border-rose px-3 py-1 text-sm text-blush hover:bg-petal"
          >
            Open screen preview
          </Link>
        </section>
      )}

      {isOwnerView && (
        <section>
          <HeightMatchedRow
            left={
              <>
                <h2 className="p-2 pb-1 text-lg font-semibold text-plum">Change log</h2>
                <table className="w-full table-fixed border-collapse text-left text-sm text-plum">
                  <thead>
                    <tr className="sticky top-0 z-10 border-b border-petal bg-white">
                      <th className="w-[15%] py-2 pr-4 pl-2">When</th>
                      <th className="w-[20%] py-2 pr-4">Who</th>
                      <th className="w-[10%] py-2 pr-4">Action</th>
                      <th className="w-[20%] py-2 pr-4">Student</th>
                      <th className="w-[12%] py-2 pr-4">From</th>
                      <th className="w-[23%] py-2 pr-2">To</th>
                    </tr>
                  </thead>
                  <tbody>
                    {changeLog.map((c) => (
                      <tr key={c.id} className="border-b border-petal">
                        <td className="py-2 pr-4 pl-2">{c.timestamp.toLocaleString()}</td>
                        <td className="break-all py-2 pr-4">{c.who}</td>
                        <td className="break-all py-2 pr-4">{c.action}</td>
                        <td className="break-all py-2 pr-4">{c.studentEmail ?? "—"}</td>
                        <td className="break-all py-2 pr-4">{c.fromTrip ?? "—"}</td>
                        <td className="break-all py-2 pr-2">{c.toTrip ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            }
            right={
              <>
                {showSimulationPanel && (
                  <div>
                    <h2 className="mb-2 text-lg font-semibold text-blush">Simulation controls</h2>
                    <SimulationPanel trips={tripOptions.map((t) => ({ id: t.id, name: t.name }))} />
                  </div>
                )}
                <div>
                  <h2 className="mb-2 text-lg font-semibold text-blush">Access management</h2>
                  <AccessManagement roles={adminRoles} trips={tripOptions} />
                </div>
              </>
            }
          />
        </section>
      )}
    </main>
  );
}

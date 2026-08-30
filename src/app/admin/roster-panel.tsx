"use client";

import { useRef, useState } from "react";
import { RosterRowActions } from "./roster-row-actions";

interface RosterRow {
  name: string;
  email: string;
  grade: string;
  submissionStatus: "none" | "opted_out" | "submitted";
  waiverUploadedAt: Date | null;
  assignedTripId: string | null;
  assignedTripName: string | null;
}

interface FlaggedRow {
  name: string;
  email: string;
  notes: string;
}

interface TripOption {
  id: string;
  name: string;
  seatsFilled: number;
  capacity: number;
}

const GRADE_LABELS: Record<string, string> = {
  senior: "Senior",
  junior: "Junior",
  sophomore: "Sophomore",
  freshman: "Freshman",
};

/**
 * Roster overview (left 60%, scrollable to ~7 rows) paired with the
 * flagged-student lists (right 40%) — one client component because
 * clicking a name in either flagged list needs to scroll the roster box
 * to that student's row and flash it, which means both sides share state
 * (highlightedEmail) that a server component can't hold.
 */
export function RosterPanel({
  rows,
  canMove,
  tripOptions,
  nonResponders,
  unplaced,
}: {
  rows: RosterRow[];
  canMove: boolean;
  tripOptions: TripOption[];
  nonResponders: { grade: string; rows: FlaggedRow[] }[];
  unplaced: { grade: string; rows: FlaggedRow[] }[];
}) {
  const [highlighted, setHighlighted] = useState<string | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function scrollToStudent(email: string) {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    document.getElementById(`roster-row-${email}`)?.scrollIntoView({
      behavior: "smooth",
      block: "center",
    });
    setHighlighted(email);
    timeoutRef.current = setTimeout(() => setHighlighted(null), 1800);
  }

  return (
    <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[3fr_2fr]">
      <div className="max-h-[345px] overflow-y-auto rounded border border-petal bg-white">
        <table className="w-full border-collapse text-left text-sm">
          <thead>
            <tr className="sticky top-0 z-10 border-b border-petal bg-white">
              <th className="py-2 pr-4 pl-2">Name</th>
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
              <tr
                key={row.email}
                id={`roster-row-${row.email}`}
                className={`border-b border-petal transition-colors duration-500 ${
                  highlighted === row.email ? "bg-petal" : ""
                }`}
              >
                <td className="py-2 pr-4 pl-2">{row.name}</td>
                <td className="py-2 pr-4">{row.email}</td>
                <td className="py-2 pr-4">{row.grade}</td>
                <td className="py-2 pr-4">{row.submissionStatus}</td>
                <td className="py-2 pr-4">{row.waiverUploadedAt ? "uploaded" : "—"}</td>
                <td className="py-2 pr-4">{row.assignedTripName ?? "—"}</td>
                {canMove && (
                  <td className="py-2 pr-2 text-right">
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
      </div>

      <div className="flex flex-col gap-4 text-sm">
        <div>
          <h3 className="mb-1 font-medium text-plum">Non-responders (need manual placement)</h3>
          <FlaggedList groups={nonResponders} onClickName={scrollToStudent} />
        </div>
        <div>
          <h3 className="mb-1 font-medium text-plum">Submitted but unplaced (all 4 choices were full)</h3>
          <FlaggedList groups={unplaced} onClickName={scrollToStudent} />
        </div>
      </div>
    </div>
  );
}

function FlaggedList({
  groups,
  onClickName,
}: {
  groups: { grade: string; rows: FlaggedRow[] }[];
  onClickName: (email: string) => void;
}) {
  const anyRows = groups.some((g) => g.rows.length > 0);
  if (!anyRows) return <p className="text-plum/60">None.</p>;
  return (
    <>
      {groups.map((g) =>
        g.rows.length === 0 ? null : (
          <div key={g.grade} className="mb-2">
            <p className="text-xs font-medium uppercase text-plum/60">
              {GRADE_LABELS[g.grade] ?? g.grade}
            </p>
            <ul className="flex flex-col gap-0.5">
              {g.rows.map((r) => (
                <li key={r.email}>
                  <button
                    type="button"
                    onClick={() => onClickName(r.email)}
                    className="text-left text-plum underline decoration-petal hover:text-magenta"
                  >
                    {r.name} ({r.email}){r.notes ? ` — notes: ${r.notes}` : ""}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ),
      )}
    </>
  );
}

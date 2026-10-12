"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface RosterOption {
  email: string;
  name: string;
  grade: string;
}

interface TripOption {
  id: string;
  name: string;
}

export function ViewAsControl({
  rosterOptions,
  trips,
}: {
  rosterOptions: RosterOption[];
  trips: TripOption[];
}) {
  const router = useRouter();
  const [role, setRole] = useState<"student" | "teacher" | "staff_admin">("student");
  const [email, setEmail] = useState("");
  const [tripId, setTripId] = useState("");
  const [timePhase, setTimePhase] = useState<"before" | "during" | "after">("during");
  const [status, setStatus] = useState<"idle" | "saving" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function start() {
    setStatus("saving");
    setErrorMessage(null);
    const res = await fetch("/api/admin/view-as", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        role,
        email: role === "student" ? email : undefined,
        tripId: role === "teacher" ? tripId : undefined,
        timePhase: role === "student" ? timePhase : undefined,
      }),
    });
    if (res.ok) {
      router.push("/");
      router.refresh();
    } else {
      const data = await res.json();
      setStatus("error");
      setErrorMessage(data.error ?? "Failed to start simulation.");
    }
  }

  return (
    <div className="flex flex-wrap items-end gap-2 rounded border border-rose bg-petal p-3 text-sm">
      <label className="flex flex-col gap-1">
        View as
        <select
          className="rounded border border-petal bg-white p-1"
          value={role}
          onChange={(e) => setRole(e.target.value as typeof role)}
        >
          <option value="student">Student</option>
          <option value="teacher">Teacher</option>
          <option value="staff_admin">Staff-admin</option>
        </select>
      </label>

      {role === "student" && (
        <>
          <label className="flex flex-col gap-1">
            Student
            <select className="rounded border border-petal bg-white p-1" value={email} onChange={(e) => setEmail(e.target.value)}>
              <option value="">Select a student…</option>
              {rosterOptions.map((r) => (
                <option key={r.email} value={r.email}>
                  {r.name} ({r.grade})
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            Wave time
            <select
              className="rounded border border-petal bg-white p-1"
              value={timePhase}
              onChange={(e) => setTimePhase(e.target.value as typeof timePhase)}
            >
              <option value="before">Before their wave opens</option>
              <option value="during">During their wave (can submit)</option>
              <option value="after">After their wave closes</option>
            </select>
          </label>
        </>
      )}

      {role === "teacher" && (
        <label className="flex flex-col gap-1">
          Trip
          <select className="rounded border border-petal bg-white p-1" value={tripId} onChange={(e) => setTripId(e.target.value)}>
            <option value="">Select a trip…</option>
            {trips.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
      )}

      <button
        onClick={start}
        disabled={
          status === "saving" ||
          (role === "student" && !email) ||
          (role === "teacher" && !tripId)
        }
        className="rounded bg-magenta px-3 py-1 text-background hover:brightness-90 disabled:opacity-40"
      >
        Start
      </button>
      {errorMessage && <p className="w-full text-red-600">{errorMessage}</p>}
    </div>
  );
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface RoleRow {
  email: string;
  role: "owner" | "staff_admin" | "teacher";
  tripId: string | null;
  tripName: string | null;
}

interface TripOption {
  id: string;
  name: string;
}

export function AccessManagement({ roles, trips }: { roles: RoleRow[]; trips: TripOption[] }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"owner" | "staff_admin" | "teacher">("staff_admin");
  const [tripId, setTripId] = useState("");
  const [status, setStatus] = useState<"idle" | "saving" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleGrant() {
    setStatus("saving");
    setErrorMessage(null);
    const res = await fetch("/api/admin/roles", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, role, tripId: role === "teacher" ? tripId : undefined }),
    });
    if (res.ok) {
      setEmail("");
      setTripId("");
      setStatus("idle");
      router.refresh();
    } else {
      const data = await res.json();
      setStatus("error");
      setErrorMessage(data.error ?? "Failed to grant role.");
    }
  }

  async function handleRevoke(targetEmail: string) {
    await fetch("/api/admin/roles", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: targetEmail }),
    });
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-4">
      <table className="w-full border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-petal">
            <th className="py-2 pr-4">Email</th>
            <th className="py-2 pr-4">Role</th>
            <th className="py-2 pr-4">Trip</th>
            <th className="py-2 pr-4"></th>
          </tr>
        </thead>
        <tbody>
          {roles.map((r) => (
            <tr key={r.email} className="border-b">
              <td className="py-2 pr-4">{r.email}</td>
              <td className="py-2 pr-4">{r.role}</td>
              <td className="py-2 pr-4">{r.tripName ?? "—"}</td>
              <td className="py-2 pr-4">
                <button onClick={() => handleRevoke(r.email)} className="text-red-600 underline">
                  Revoke
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="flex flex-wrap items-end gap-2 rounded border border-petal bg-white p-3 text-sm">
        <label className="flex flex-col gap-1">
          Email
          <input
            className="rounded border border-petal bg-white p-1"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="someone@presentationhs.org"
          />
        </label>
        <label className="flex flex-col gap-1">
          Role
          <select
            className="rounded border border-petal bg-white p-1"
            value={role}
            onChange={(e) => setRole(e.target.value as typeof role)}
          >
            <option value="staff_admin">staff_admin</option>
            <option value="teacher">teacher</option>
            <option value="owner">owner</option>
          </select>
        </label>
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
          onClick={handleGrant}
          disabled={!email || (role === "teacher" && !tripId) || status === "saving"}
          className="rounded bg-magenta px-3 py-1 text-white hover:bg-rose disabled:opacity-40"
        >
          Grant
        </button>
        {errorMessage && <p className="w-full text-red-600">{errorMessage}</p>}
      </div>
    </div>
  );
}

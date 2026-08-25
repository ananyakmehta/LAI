"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

interface TripOption {
  id: string;
  name: string;
  seatsFilled: number;
  capacity: number;
}

export function RosterRowActions({
  studentEmail,
  currentTripId,
  trips,
}: {
  studentEmail: string;
  currentTripId: string | null;
  trips: TripOption[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [moving, setMoving] = useState(false);
  const [selectedTripId, setSelectedTripId] = useState("");
  const [status, setStatus] = useState<"idle" | "saving" | "confirm" | "error">("idle");
  const [confirmInfo, setConfirmInfo] = useState<{
    tripName: string;
    filled: number;
    capacity: number;
  } | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        reset();
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  function reset() {
    setOpen(false);
    setMoving(false);
    setSelectedTripId("");
    setStatus("idle");
    setConfirmInfo(null);
    setErrorMessage(null);
  }

  async function submitMove(force: boolean) {
    setStatus("saving");
    setErrorMessage(null);

    const res = await fetch("/api/admin/move-student", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: studentEmail, tripId: selectedTripId, force }),
    });
    const data = await res.json();

    if (res.ok) {
      reset();
      router.refresh();
      return;
    }
    if (res.status === 409 && data.needsConfirmation) {
      setStatus("confirm");
      setConfirmInfo({ tripName: data.tripName, filled: data.filled, capacity: data.capacity });
      return;
    }
    setStatus("error");
    setErrorMessage(data.error ?? "Move failed.");
  }

  return (
    <div ref={containerRef} className="relative inline-block text-left">
      <button
        onClick={() => (open ? reset() : setOpen(true))}
        className="rounded px-2 py-1 text-gray-500 hover:bg-gray-100"
        aria-label="Row actions"
        type="button"
      >
        ⋮
      </button>

      {open && !moving && (
        <div className="absolute right-0 z-10 mt-1 w-32 rounded border bg-white text-sm text-gray-900 shadow">
          <button
            className="block w-full px-3 py-2 text-left hover:bg-gray-50"
            onClick={() => setMoving(true)}
            type="button"
          >
            Move
          </button>
          {/* more row actions land here later */}
        </div>
      )}

      {open && moving && (
        <div className="absolute right-0 z-10 mt-1 w-64 rounded border bg-white p-3 text-sm text-gray-900 shadow">
          <label className="mb-2 block">
            Move to
            <select
              className="mt-1 w-full rounded border p-1"
              value={selectedTripId}
              onChange={(e) => {
                setSelectedTripId(e.target.value);
                setStatus("idle");
                setConfirmInfo(null);
              }}
            >
              <option value="">Select a trip…</option>
              {trips
                .filter((t) => t.id !== currentTripId)
                .map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} ({t.seatsFilled}/{t.capacity})
                  </option>
                ))}
            </select>
          </label>

          {status === "confirm" && confirmInfo && (
            <p className="mb-2 text-amber-700">
              {confirmInfo.tripName} is at capacity ({confirmInfo.filled}/{confirmInfo.capacity}).
              Overbook anyway?
            </p>
          )}
          {status === "error" && errorMessage && (
            <p className="mb-2 text-red-600">{errorMessage}</p>
          )}

          <div className="flex gap-2">
            <button
              type="button"
              disabled={!selectedTripId || status === "saving"}
              onClick={() => submitMove(status === "confirm")}
              className="rounded bg-gray-900 px-2 py-1 text-white disabled:opacity-40"
            >
              {status === "confirm" ? "Confirm overbook" : "Move"}
            </button>
            <button type="button" onClick={reset} className="rounded border px-2 py-1">
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

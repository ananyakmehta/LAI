"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Owner-only upload of the full student roster (name, email, grade). This
 * is the canonical list non-responders get checked against — a student
 * who never clicks the sign-in link still needs to be on this list to be
 * counted, rather than invisible to the whole process.
 */
export function RosterImport() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<"idle" | "uploading" | "done" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setStatus("uploading");
    setMessage(null);

    const formData = new FormData();
    formData.append("file", file);
    const res = await fetch("/api/admin/import-roster", { method: "POST", body: formData });
    const data = await res.json();

    if (res.ok) {
      setStatus("done");
      setMessage(`Imported/updated ${data.count} roster rows.`);
      router.refresh();
    } else {
      setStatus("error");
      setMessage(data.message ?? "Import failed.");
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  return (
    <div className="flex flex-col gap-2 rounded border border-petal bg-white p-4">
      <p className="text-sm text-plum/70">
        Upload a CSV with columns <code>name, email, grade, notes</code> (notes optional). Matching
        rows (by email) are updated in place; new rows are added.
      </p>
      <input
        ref={fileInputRef}
        type="file"
        accept=".csv,text/csv"
        onChange={handleUpload}
        disabled={status === "uploading"}
        className="text-sm"
      />
      {status === "uploading" && <p className="text-sm text-plum/70">Uploading…</p>}
      {status === "done" && <p className="text-sm text-green-700">{message}</p>}
      {status === "error" && <p className="text-sm text-red-600">{message}</p>}
    </div>
  );
}

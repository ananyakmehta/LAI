"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

export default function WaiverPage() {
  const [uploadedAt, setUploadedAt] = useState<string | null | undefined>(
    undefined,
  );
  const [status, setStatus] = useState<"idle" | "uploading" | "done" | "error">(
    "idle",
  );

  useEffect(() => {
    fetch("/api/waivers")
      .then((r) => r.json())
      .then((data) => setUploadedAt(data.waiver?.uploadedAt ?? null));
  }, []);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setStatus("uploading");
    const formData = new FormData();
    formData.append("file", file);

    const res = await fetch("/api/waivers", { method: "POST", body: formData });
    if (res.ok) {
      setStatus("done");
      setUploadedAt(new Date().toISOString());
    } else {
      setStatus("error");
    }
  }

  return (
    <main className="mx-auto flex max-w-2xl flex-1 flex-col gap-4 p-8">
      <Link href="/" className="text-sm text-gray-500 underline">
        &larr; back
      </Link>
      <h1 className="text-2xl font-semibold">Waiver</h1>

      <a
        href="/waiver-template.pdf"
        className="w-fit rounded border px-4 py-2 text-sm hover:bg-gray-50"
      >
        Download the waiver form
      </a>

      <div className="flex flex-col gap-2">
        <label className="text-sm font-medium">
          Upload your signed copy (PDF)
        </label>
        <input type="file" accept="application/pdf" onChange={handleUpload} />
      </div>

      {status === "uploading" && (
        <p className="text-sm text-gray-600">Uploading…</p>
      )}
      {status === "error" && (
        <p className="text-sm text-red-600">
          Upload failed — make sure it&apos;s a PDF under 10MB and try again.
        </p>
      )}
      {uploadedAt && (
        <p className="text-sm text-green-700">
          Uploaded {new Date(uploadedAt).toLocaleString()}. Re-uploading
          replaces this copy.
        </p>
      )}
      {uploadedAt === null && status === "idle" && (
        <p className="text-sm text-gray-600">No waiver uploaded yet.</p>
      )}
    </main>
  );
}

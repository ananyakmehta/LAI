import { redirect } from "next/navigation";
import { getViewContext } from "@/lib/view-context";
import { getTripsWithCounts } from "@/db/queries/trips";
import { PreviewClient } from "./preview-client";
import Link from "next/link";

/**
 * Owner-only layout check — every student-facing screen, rendered with
 * fabricated submission/assignment data built client-side from the REAL
 * trip catalog. Writes nothing to the database: this exists specifically
 * so the owner can review screens without touching real student data,
 * now that the old "view as" simulation is hidden for the live event.
 */
export default async function PreviewPage() {
  const ctx = await getViewContext();
  if (!ctx || ctx.role !== "owner") {
    redirect("/");
  }

  const trips = await getTripsWithCounts();

  return (
    <main className="mx-auto flex max-w-2xl flex-1 flex-col gap-6 p-8">
      <Link href="/admin" className="text-sm text-blush/60 underline">
        &larr; back to dashboard
      </Link>
      <div>
        <h1 className="text-2xl font-semibold text-blush">Screen preview</h1>
        <p className="text-sm text-blush/70">
          Every student-facing screen, with sample data built from the real trip catalog. Nothing here
          writes to the database.
        </p>
      </div>
      <PreviewClient trips={trips} />
    </main>
  );
}

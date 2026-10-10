import { redirect } from "next/navigation";
import { auth, signIn, signOut } from "@/lib/auth";
import { getViewContext } from "@/lib/view-context";
import { getEventConfig } from "@/db/queries/event-config";
import { StudentHome } from "./student-home";
import { TeacherHome } from "./teacher-home";

export default async function HomePage() {
  const session = await auth();

  if (!session?.user?.email) {
    return (
      <main className="mx-auto flex max-w-md flex-1 flex-col items-center justify-center gap-6 p-8 text-center">
        <h1 className="text-2xl font-semibold text-blush">Learning in Action Day</h1>
        <p className="text-sm text-blush/70">
          Sign in with your @presentationhs.org Google account to browse
          trips and submit your ranked choices.
        </p>
        <form
          action={async () => {
            "use server";
            await signIn("google");
          }}
        >
          <button
            type="submit"
            className="rounded bg-magenta px-4 py-2 text-plum hover:brightness-90"
          >
            Sign in with Google
          </button>
        </form>
      </main>
    );
  }

  const ctx = await getViewContext();
  if (!ctx) redirect("/");

  if (ctx.role === "owner" || ctx.role === "staff_admin") {
    redirect("/admin");
  }

  const header = (
    <div className="flex items-center justify-between">
      <p className="text-sm text-blush/70">
        {session.user.email} ({ctx.role}
        {ctx.simulated ? ", simulated" : ""})
      </p>
      <form
        action={async () => {
          "use server";
          await signOut();
        }}
      >
        <button type="submit" className="text-sm text-blush/60 underline">
          Sign out
        </button>
      </form>
    </div>
  );

  if (ctx.role === "teacher") {
    return (
      <main className="mx-auto flex max-w-2xl flex-1 flex-col gap-6 p-8">
        {header}
        <TeacherHome tripId={ctx.teacherTripId} />
      </main>
    );
  }

  // student
  const eventConfig = await getEventConfig();
  // Computed here, not client-side: "now" is naturally fresh per request in
  // a server component, and this keeps StudentHome a pure render function
  // (no Date.now() inside client render/effects).
  const changeRequestVisible =
    !eventConfig.finalLockAt || new Date() < eventConfig.finalLockAt;
  return (
    <main className="mx-auto flex max-w-2xl flex-1 flex-col gap-6 p-8">
      {header}
      <StudentHome
        changeRequestVisible={changeRequestVisible}
        changeRequestWindowEndsAt={eventConfig.changeRequestWindowEndsAt?.toISOString() ?? null}
      />
    </main>
  );
}

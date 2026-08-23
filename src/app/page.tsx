import { auth, signIn, signOut } from "@/lib/auth";
import { getActor } from "@/lib/permissions";

export default async function HomePage() {
  const session = await auth();

  if (!session?.user?.email) {
    return (
      <main className="mx-auto flex max-w-md flex-1 flex-col items-center justify-center gap-6 p-8 text-center">
        <h1 className="text-2xl font-semibold">Learning in Action Day</h1>
        <p className="text-sm text-gray-600">
          Sign in with your @presentationhs.org Google account to browse
          trips, submit your ranked choices, or upload your waiver.
        </p>
        <form
          action={async () => {
            "use server";
            await signIn("google");
          }}
        >
          <button
            type="submit"
            className="rounded bg-gray-900 px-4 py-2 text-white hover:bg-gray-700"
          >
            Sign in with Google
          </button>
        </form>
      </main>
    );
  }

  const actor = await getActor(session.user.email);
  const isAdminTier =
    actor.role === "owner" || actor.role === "staff_admin" || actor.role === "teacher";

  return (
    <main className="mx-auto flex max-w-md flex-1 flex-col gap-6 p-8">
      <div>
        <h1 className="text-2xl font-semibold">Learning in Action Day</h1>
        <p className="text-sm text-gray-600">
          Signed in as {session.user.email} ({actor.role})
        </p>
      </div>

      <nav className="flex flex-col gap-2">
        <a className="rounded border px-4 py-2 hover:bg-gray-50" href="/trips">
          Browse trips
        </a>
        {actor.role === "student" && (
          <>
            <a className="rounded border px-4 py-2 hover:bg-gray-50" href="/submit">
              Submit / edit my ranked choices
            </a>
            <a className="rounded border px-4 py-2 hover:bg-gray-50" href="/waiver">
              Waiver
            </a>
            <a className="rounded border px-4 py-2 hover:bg-gray-50" href="/my-trip">
              My trip
            </a>
          </>
        )}
        {isAdminTier && (
          <a className="rounded border px-4 py-2 hover:bg-gray-50" href="/admin">
            Admin dashboard
          </a>
        )}
      </nav>

      <form
        action={async () => {
          "use server";
          await signOut();
        }}
      >
        <button type="submit" className="text-sm text-gray-500 underline">
          Sign out
        </button>
      </form>
    </main>
  );
}

import Link from "next/link";

// Public by design — no auth check. Google's own OAuth consent screen links
// here for signed-out users, and needs to be reachable without a session.
export default function PrivacyPage() {
  return (
    <main className="mx-auto flex max-w-2xl flex-1 flex-col gap-6 p-8">
      <Link href="/" className="text-sm text-plum/60 underline">
        &larr; back
      </Link>

      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold text-plum">Privacy Policy</h1>
        <p className="text-sm text-plum/60">Last updated September 16, 2026</p>
      </div>

      <p className="text-sm text-plum/70">
        Learning In Action is a tool built to run Presentation High
        School&rsquo;s Learning in Action Day trip sign-up and assignment
        process.
      </p>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold text-plum">What we collect</h2>
        <ul className="flex flex-col gap-2 text-sm text-plum/70">
          <li>
            <strong className="text-plum">From Google Sign-In:</strong> your
            name, email address, and profile photo, provided by Google when
            you sign in. Signing in does not give this app access to your
            Google password, Gmail, Drive, Calendar, or anything else in your
            Google account.
          </li>
          <li>
            <strong className="text-plum">From the school roster:</strong>{" "}
            your name, email, and grade level.
          </li>
          <li>
            <strong className="text-plum">Your trip choices:</strong> the
            ranked list of trips you submit, or that you&rsquo;ve opted out of
            the event.
          </li>
          <li>
            <strong className="text-plum">Your waiver:</strong> some trips
            require a waiver hosted on that trip&rsquo;s own site (e.g. a
            climbing gym&rsquo;s release form) — we don&rsquo;t host or store
            the waiver itself, only a checkbox confirming you completed it.
          </li>
          <li>
            <strong className="text-plum">Your final trip assignment:</strong>{" "}
            which trip you were placed in, and whether it was decided by
            lottery or by manual override.
          </li>
        </ul>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold text-plum">Who can see what</h2>
        <ul className="flex flex-col gap-2 text-sm text-plum/70">
          <li>
            <strong className="text-plum">Students</strong> can see their own
            information and, once assignments are made, the name of their own
            trip.
          </li>
          <li>
            <strong className="text-plum">Teachers</strong> can see the
            roster only for the trip they&rsquo;re chaperoning: names, emails,
            waiver status.
          </li>
          <li>
            <strong className="text-plum">Event organizers</strong> (the
            owner and anyone specifically granted admin access) can see the
            full roster, all submissions, and the audit log of changes.
          </li>
        </ul>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold text-plum">Where your data lives</h2>
        <p className="text-sm text-plum/70">
          Roster, submission, and assignment data is stored in a managed
          database. The app itself runs on Vercel. Both are cloud
          infrastructure providers, neither has any independent access to use
          your data.
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold text-plum">How long we keep it</h2>
        <p className="text-sm text-plum/70">
          Data is kept for as long as needed to run this year&rsquo;s
          event/recordkeeping. If you&rsquo;d like your information removed
          sooner, please email us.
        </p>
      </section>

      <section className="flex flex-col gap-2 border-t border-petal pt-6">
        <h2 className="text-lg font-semibold text-plum">Questions</h2>
        <p className="text-sm text-plum/70">
          If anything here is unclear, or you&rsquo;d like your data changed
          or removed, email{" "}
          <a href="mailto:ananya.k.mehta@gmail.com" className="text-plum underline">
            ananya.k.mehta@gmail.com
          </a>
          .
        </p>
      </section>
    </main>
  );
}

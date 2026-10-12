import Link from "next/link";

// Public by design — no auth check. Google's own OAuth consent screen links
// here for signed-out users, and needs to be reachable without a session.
export default function PrivacyPage() {
  return (
    <main className="flex w-full flex-1 flex-col gap-6 p-6">
      <Link href="/" className="text-sm text-blush/60 underline">
        &larr; back
      </Link>

      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold text-blush">Privacy Policy</h1>
        <p className="text-sm text-blush/60">Last updated September 16, 2026</p>
      </div>

      <p className="text-sm text-blush/70">
        Learning In Action is a tool built to run Presentation High
        School&rsquo;s Learning in Action Day trip sign-up and assignment
        process.
      </p>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold text-blush">What we collect</h2>
        <ul className="flex flex-col gap-2 text-sm text-blush/70">
          <li>
            <strong className="text-blush">From Google Sign-In:</strong> your
            name, email address, and profile photo, provided by Google when
            you sign in. Signing in does not give this app access to your
            Google password, Gmail, Drive, Calendar, or anything else in your
            Google account.
          </li>
          <li>
            <strong className="text-blush">From the school roster:</strong>{" "}
            your name, email, and grade level.
          </li>
          <li>
            <strong className="text-blush">Your trip choices:</strong> the
            ranked list of trips you submit, or that you&rsquo;ve opted out of
            the event.
          </li>
          <li>
            <strong className="text-blush">Your final trip assignment:</strong>{" "}
            which trip you were placed in, and whether it was decided by
            lottery or by manual override.
          </li>
        </ul>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold text-blush">Who can see what</h2>
        <ul className="flex flex-col gap-2 text-sm text-blush/70">
          <li>
            <strong className="text-blush">Students</strong> can see their own
            information and, once assignments are made, the name of their own
            trip.
          </li>
          <li>
            <strong className="text-blush">Teachers</strong> can see the
            roster only for the trip they&rsquo;re chaperoning: names and
            emails.
          </li>
          <li>
            <strong className="text-blush">Event organizers</strong> (the
            owner and anyone specifically granted admin access) can see the
            full roster, all submissions, and the audit log of changes.
          </li>
        </ul>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold text-blush">Where your data lives</h2>
        <p className="text-sm text-blush/70">
          Roster, submission, and assignment data is stored in a managed
          database. The app itself runs on Vercel. Both are cloud
          infrastructure providers, neither has any independent access to use
          your data.
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold text-blush">How long we keep it</h2>
        <p className="text-sm text-blush/70">
          Data is kept for as long as needed to run this year&rsquo;s
          event/recordkeeping. If you&rsquo;d like your information removed
          sooner, please email us.
        </p>
      </section>

      <section className="flex flex-col gap-2 border-t border-petal pt-6">
        <h2 className="text-lg font-semibold text-blush">Questions</h2>
        <p className="text-sm text-blush/70">
          If anything here is unclear, or you&rsquo;d like your data changed
          or removed, email{" "}
          <a href="mailto:ananya.k.mehta@gmail.com" className="text-blush underline">
            ananya.k.mehta@gmail.com
          </a>
          .
        </p>
      </section>
    </main>
  );
}

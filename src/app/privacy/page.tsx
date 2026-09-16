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
        Learning In Action is a tool built to run Presentation High School&rsquo;s
        Learning in Action Day trip sign-up and assignment process. It isn&rsquo;t
        an official school system — it&rsquo;s built and run by Ananya Mehta, a
        student at the school, using roster data the school provided for this
        one event. This page explains what it collects, why, and who can see
        it.
      </p>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold text-plum">What we collect</h2>
        <ul className="flex flex-col gap-2 text-sm text-plum/70">
          <li>
            <strong className="text-plum">From Google Sign-In:</strong> your
            name, email address, and profile photo, provided by Google when
            you sign in. We never see your Google password, and signing in
            doesn&rsquo;t give this app access to your Gmail, Drive, Calendar,
            or anything else in your Google account — only that basic profile
            information.
          </li>
          <li>
            <strong className="text-plum">From the school roster:</strong>{" "}
            your name, email, and grade level, imported once from school
            records so the sign-in page can confirm you&rsquo;re a student
            here.
          </li>
          <li>
            <strong className="text-plum">Your trip choices:</strong> the
            ranked list of trips you submit, or that you&rsquo;ve opted out of
            the event.
          </li>
          <li>
            <strong className="text-plum">Your waiver:</strong> if you upload
            a signed waiver PDF, we store the file itself, tied to your email
            address, solely to confirm it was submitted.
          </li>
          <li>
            <strong className="text-plum">Your final trip assignment:</strong>{" "}
            which trip you were placed on, and whether that was decided by the
            lottery or by a manual override.
          </li>
        </ul>
        <p className="text-sm text-plum/70">
          We don&rsquo;t collect anything beyond this — no location tracking,
          no analytics or advertising trackers, and nothing is sold or shared
          outside this system.
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold text-plum">Who can see what</h2>
        <ul className="flex flex-col gap-2 text-sm text-plum/70">
          <li>
            <strong className="text-plum">Students</strong> can see their own
            information and, once assignments are made, the name of their own
            trip — never the names of other students, on any trip, at any
            point. That&rsquo;s a deliberate design choice, not an oversight.
          </li>
          <li>
            <strong className="text-plum">Teachers</strong> can see the
            roster — names, emails, waiver status — only for the trip
            they&rsquo;re chaperoning.
          </li>
          <li>
            <strong className="text-plum">Event organizers</strong> (the
            owner and anyone specifically granted admin access) can see the
            full roster, all submissions, and the audit log of changes, since
            running the event and manually placing students who need it
            requires that.
          </li>
        </ul>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold text-plum">Where your data lives</h2>
        <p className="text-sm text-plum/70">
          Roster, submission, and assignment data is stored in a managed
          database (Supabase). Uploaded waiver PDFs are stored in that same
          provider&rsquo;s file storage. The app itself runs on Vercel. Both
          are cloud infrastructure providers — neither has any independent
          access to use your data for their own purposes.
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold text-plum">How long we keep it</h2>
        <p className="text-sm text-plum/70">
          Data is kept for as long as needed to run this year&rsquo;s event
          and for the school&rsquo;s own recordkeeping. If you&rsquo;d like
          your information removed sooner, email us and we&rsquo;ll take care
          of it.
        </p>
      </section>

      <section className="flex flex-col gap-2 border-t border-petal pt-6">
        <h2 className="text-lg font-semibold text-plum">Questions</h2>
        <p className="text-sm text-plum/70">
          This is a small, single-purpose tool, not a company. If anything
          here is unclear, or you&rsquo;d like your data changed or removed,
          email{" "}
          <a href="mailto:ananya.k.mehta@gmail.com" className="text-plum underline">
            ananya.k.mehta@gmail.com
          </a>
          .
        </p>
      </section>
    </main>
  );
}

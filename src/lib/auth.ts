import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { roster, changeLog, adminRoles } from "@/db/schema";
import { getEventConfig } from "@/db/queries/event-config";
import { gradeFromEmail, SCHOOL_DOMAIN } from "@/lib/grade";

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Google({
      // No `hd` param: it would push the Google account picker toward the
      // school domain, which would work against the personal-account
      // exception below. The signIn callback is the actual enforcement
      // boundary (§7), not this hint — requires the OAuth consent screen to
      // be "External" type, since "Internal" blocks non-Workspace accounts
      // at Google's level before this callback ever runs.
    }),
  ],
  session: { strategy: "jwt" },
  callbacks: {
    async signIn({ user, profile }) {
      const email = user.email?.toLowerCase();
      if (!email) return false;

      const isDomainEmail = email.endsWith(`@${SCHOOL_DOMAIN}`);
      const isConfiguredOwner = email === process.env.OWNER_EMAIL?.toLowerCase();

      // The only account allowed in from outside the school domain is the
      // one exact address configured as OWNER_EMAIL — not domain-wide, one
      // named exception. This exists because a graduating student's school
      // account gets deleted, but they may keep maintaining this system
      // from a personal account. It still only grants entry past this gate,
      // not owner power by itself — see the admin_roles check below.
      if (!isDomainEmail && !isConfiguredOwner) return false;

      // Google asserts `hd` in the verified profile for Workspace accounts —
      // a real check, not just cosmetic. Only applies to domain accounts;
      // a personal Google account has no `hd` claim at all.
      if (isDomainEmail && profile && "hd" in profile && profile.hd !== SCHOOL_DOMAIN) {
        return false;
      }

      const [adminRow] = await db
        .select()
        .from(adminRoles)
        .where(eq(adminRoles.email, email))
        .limit(1);

      if (isConfiguredOwner) {
        // The personal-account exception must still actually hold the
        // owner role — knowing/using this address isn't enough by itself.
        return adminRow?.role === "owner";
      }

      // §7's roster/grade check below is written for students. Owner/
      // staff-admin/teacher accounts (§6) aren't on the student roster and
      // don't have grad-year-formatted emails, so an admin_roles row (which
      // only the owner can create) is sufficient authorization for them —
      // skip the student-specific check entirely for anyone provisioned.
      if (adminRow) return true;

      // Two-factor check (§7): (1) email must be in the roster, and (2) the
      // grade parsed from the email suffix must match the roster's grade.
      // Either failing blocks login and gets flagged for owner review,
      // rather than silently resolved either way.
      const [rosterRow] = await db
        .select()
        .from(roster)
        .where(eq(roster.email, email))
        .limit(1);

      const eventConfig = await getEventConfig();
      const parsedGrade = gradeFromEmail(email, eventConfig.currentSeniorGradYear);

      if (!rosterRow || !parsedGrade || parsedGrade !== rosterRow.grade) {
        await db.insert(changeLog).values({
          who: "system",
          action: "login_blocked_mismatch",
          studentEmail: email,
          fromTrip: rosterRow ? rosterRow.grade : "not_on_roster",
          toTrip: parsedGrade ?? "unparseable_email",
        });
        return false;
      }

      return true;
    },
    async jwt({ token, user }) {
      if (user?.email) token.email = user.email.toLowerCase();
      return token;
    },
    async session({ session, token }) {
      if (session.user && typeof token.email === "string") {
        session.user.email = token.email;
      }
      return session;
    },
  },
});

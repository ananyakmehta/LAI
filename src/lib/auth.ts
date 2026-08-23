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
      // `hd` restricts the Google account picker to this Workspace domain.
      // This is a UX hint, not the real enforcement — the signIn callback
      // below does the actual two-factor check (§7).
      authorization: { params: { hd: SCHOOL_DOMAIN } },
    }),
  ],
  session: { strategy: "jwt" },
  callbacks: {
    async signIn({ user, profile }) {
      const email = user.email?.toLowerCase();
      if (!email || !email.endsWith(`@${SCHOOL_DOMAIN}`)) return false;

      // Google asserts `hd` in the verified profile for Workspace accounts —
      // a real check, not just cosmetic.
      if (profile && "hd" in profile && profile.hd !== SCHOOL_DOMAIN) {
        return false;
      }

      // §7's roster/grade check is written for students. Owner/staff-admin/
      // teacher accounts (§6) aren't on the student roster and don't have
      // grad-year-formatted emails, so an admin_roles row (which only the
      // owner can create) is sufficient authorization for them — skip the
      // student-specific check entirely for anyone already provisioned.
      const [adminRow] = await db
        .select()
        .from(adminRoles)
        .where(eq(adminRoles.email, email))
        .limit(1);
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

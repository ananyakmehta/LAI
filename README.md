# Learning in Action Day — Signup System

Student trip-signup app for Presentation High School's Learning in Action
day. Full background and locked spec: `DD_LAI_init_build.md`. Build plan and
the decisions made while building it: `.claude/plans` history, or ask
Claude Code to summarize.

This README is the step-by-step setup walkthrough — written for someone who
hasn't deployed an app like this before. Each section explains what you're
creating and why before you do it.

## What you're setting up, in order

1. Two free Supabase projects (Postgres + file storage) — one for
   experimenting freely (`dev`), one for the real thing (`prod`).
2. A Google Cloud OAuth client, so students/staff can sign in with their
   `@presentationhs.org` Google account.
3. Vercel, to actually deploy the app and run the overnight lottery job.

You'll end up with real accounts on all three services, all free at this
project's scale (~500 students).

---

## 1. Supabase — dev and prod projects

Go to [supabase.com](https://supabase.com), sign up (GitHub login is fine),
and create **two** projects:

- `lai-dev` — for you to poke around in, break things, and learn SQL. Seed
  it with fake data; nothing here matters.
- `lai-prod` — the real database, once real roster data exists.

For each project, once it's created:

1. The green **Connect** button (top-right of the project's page) opens a
   dialog — the **"Direct"** tab has a **Connection Method** radio group:
   - **Transaction pooler** (port 6543) — this is `DATABASE_URL`.
   - **Direct connection** (port 5432) — this is `DIRECT_URL`.
   Both string values include a `[YOUR-PASSWORD]` placeholder — swap in the
   real DB password (from project creation, or "Reset database password"
   right there in the dialog). The **Project URL** (→ `SUPABASE_URL`) is
   shown right on the project's home page, next to the project name.
2. Go to **Storage** and create a new **private** bucket named `waivers`.
   Private means files aren't publicly readable by URL — the app fetches
   them server-side.
3. Go to **Project Settings → API Keys**. Supabase's newer key system has
   two sections: **Publishable key** (`sb_publishable_...` — not what we
   need) and **Secret keys** (`sb_secret_...` — this one). Click the eye
   icon to reveal it, copy it → `SUPABASE_SERVICE_ROLE_KEY`. It bypasses
   row-level security, so never expose it to the browser or commit it —
   server-only. (If your project still shows the older "Legacy anon,
   service_role API keys" tab instead, the `service_role` key there is the
   same thing under the old naming.)

**Learning the raw SQL side (dev project only):** Supabase's dashboard has a
**SQL Editor** — a real Postgres SQL prompt in your browser, no install
needed. Once the schema is migrated in (step 5), try:

```sql
select * from roster limit 10;
select grade, count(*) from roster group by grade;
select * from trips;
```

You can also connect with a native client (`psql`, TablePlus, etc.) using
the direct connection string if you'd rather. Break things freely here —
it's `dev`.

**Heads up**: Supabase free projects pause after 7 days of no activity. If
there's a long gap between finishing setup and the actual event, you may
need to manually resume the `prod` project from the dashboard before
launch.

## 2. Google Cloud Console — OAuth client

1. Go to [console.cloud.google.com](https://console.cloud.google.com),
   create a new project (any name, e.g. "LAI Signup").
2. **APIs & Services → OAuth consent screen**: set up as **External**, not
   Internal. Internal-type clients are blocked at Google's infrastructure
   level from ever authenticating a non-Workspace account — which would
   permanently rule out the personal-account owner exception below. The
   app's own login check (§7, plus the personal-account exception in
   `src/lib/auth.ts`) is the real enforcement regardless of this setting.
   One consequence of External: users may see an "unverified app" warning
   during sign-in (a "Continue" link, not a hard block) unless you complete
   Google's verification review — normal for a project this size, and
   avoidable review only matters if you request sensitive scopes, which
   this app doesn't.
3. **APIs & Services → Credentials → Create Credentials → OAuth client ID**,
   type **Web application**.
   - Authorized redirect URIs: add both
     `http://localhost:3000/api/auth/callback/google` (for local dev) and
     `https://<your-vercel-domain>/api/auth/callback/google` (add this once
     you know your Vercel URL from step 3 below).
4. Copy the **Client ID** and **Client Secret** into `.env` as
   `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET`.

## 3. Environment file

```bash
cp .env.example .env
```

Fill in everything from steps 1-2, plus:

- `AUTH_SECRET` — generate with `openssl rand -base64 33`. Auth.js uses this
  to sign/encrypt session cookies; it's not tied to any account, just a
  random secret local to this deployment.
- `OWNER_EMAIL` — normally your real `@presentationhs.org` address. If your
  school account will be deleted after graduation and you're using the
  personal-account exception (`src/lib/auth.ts` — the one address allowed
  to log in from outside the school domain, gated on actually holding the
  owner role in `admin_roles`), put that personal email here instead.

Leave `CRON_SECRET` and `SIMULATION_SECRET` blank for now.

## 4. Install and migrate

```bash
npm install
npm run db:generate   # already done once — only re-run after schema changes
npm run db:migrate    # applies drizzle/*.sql to whichever DB DATABASE_URL/DIRECT_URL point at
```

Point `.env` at `lai-dev` first, migrate, then point it at `lai-prod` and
migrate again — both databases need the same schema.

## 5. Bootstrap the owner + event config

Still pointed at whichever DB you're setting up:

```bash
npm run seed:owner -- 27   # 27 = this year's senior graduation year, e.g. class of 2027
```

This creates your `owner` row in `admin_roles` (so you can log in and reach
`/admin`) and the single `event_config` row grade-derivation depends on.

For the dev project, also run:

```bash
npm run seed:dev-data
```

This adds 5 sample trips, 80 fake roster rows across all 4 grades, and a
placeholder wave schedule (senior wave open right now) so you have
something to click through.

## 6. Set the real wave schedule

Wave dates/times are configurable, not hardcoded — set them with the CLI
once you know the real dates:

```bash
npm run cli -- set-wave 1 "2026-09-14T08:00:00-07:00" "2026-09-14T23:59:00-07:00"
npm run cli -- set-wave 2 "2026-09-15T08:00:00-07:00" "2026-09-15T23:59:00-07:00"
npm run cli -- set-wave 3 "2026-09-16T08:00:00-07:00" "2026-09-16T23:59:00-07:00"
npm run cli -- set-wave 4 "2026-09-17T08:00:00-07:00" "2026-09-17T23:59:00-07:00"

npm run cli -- set-event-dates --reveal "2026-09-18T09:00:00-07:00" \
  --change-window-end "2026-09-25T23:59:00-07:00" \
  --final-lock "2026-10-02T23:59:00-07:00"
```

(Wave 1=senior, 2=junior, 3=sophomore, 4=freshman, per §5.)

## 7. Run it locally

```bash
npm run dev
```

Open http://localhost:3000, sign in with your `OWNER_EMAIL` Google account
(needs to be a real Google account on the `presentationhs.org` domain), and
you should land on the admin dashboard link.

## 8. Deploy to Vercel

1. [vercel.com](https://vercel.com) → sign up with GitHub → **Add New
   Project** → import the `LAI` GitHub repo.
2. Add every variable from `.env` (pointed at **prod** values) under
   **Settings → Environment Variables**. Leave `CRON_SECRET` unset — Vercel
   generates and injects it automatically once you deploy, since
   `vercel.json` declares a cron job.
3. Deploy. Note the resulting URL and add its OAuth callback to Google
   Cloud Console (step 2, redirect URIs) if you haven't already.
4. `vercel.json` schedules `/api/cron/sort` once daily — Hobby plan's cron
   limit — timed to run shortly after midnight Pacific. Adjust the UTC hour
   in `vercel.json` if your actual wave-close times land at a very
   different local time, keeping daylight saving in mind.

## 9. The CLI (production's everyday admin tool)

Point `.env`'s `DATABASE_URL`/`DIRECT_URL` at whichever database you mean
(dev or prod) before running these — there's no environment switch inside
the CLI itself, it just uses whatever `.env` currently points at.

```bash
npm run cli -- import-roster ./roster.csv
npm run cli -- move-student jsmith.27@presentationhs.org "Museum of Art"
npm run cli -- assign-non-responder jsmith.27@presentationhs.org "Museum of Art"
npm run cli -- run-sort 1
npm run cli -- set-capacity "Museum of Art" 25
npm run cli -- grant-role someone@presentationhs.org staff_admin
npm run cli -- grant-role teacher@presentationhs.org teacher "Museum of Art"
```

Every command writes to `change_log` automatically.

## 10. Before loading real student data: run the simulation

Per §13 — proves the deployed app holds up under real concurrent load, not
just one submission at a time.

1. On the **prod** (or a throwaway) deployment, temporarily set
   `SIMULATION_SECRET` in Vercel's env vars (any random string) and
   redeploy. Also set the matching value in your local `.env`.
2. Run:
   ```bash
   npm run simulate -- https://your-app.vercel.app
   ```
3. Read the PASS/FAIL summary. It seeds ~150 fake students + 5 test trips,
   fires concurrent submissions, runs the real lottery via the real cron
   endpoint, and checks: no overbooking, no double-assignment, the
   unplaced-submitter flag behaves, and an out-of-wave grade is blocked.
4. **Unset `SIMULATION_SECRET` and redeploy** before loading real roster
   data — it's a genuine auth bypass while set.

## Known gap: waiver template PDF

`src/app/waiver/page.tsx` links to `/waiver-template.pdf`, which doesn't
exist yet — add the real waiver PDF at `public/waiver-template.pdf`.

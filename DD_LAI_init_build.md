# Learning in Action Day — Signup System
## Full Context + Design Doc — Handoff to Claude Code

**Read this entire document before writing any code.** This is both the background on why this project exists and the locked specification for what to build. Section 12 contains explicit build instructions — the goal is a **live, deployed, working first pass**, not a local scaffold.

---

## 1. Background — what this is and why it's being rebuilt

Presentation High School (~500 students total) runs an annual "Learning in Action" day: students go on one of ~20–25 different field trips, with each trip capped at ~20–25 students. Seniority determines priority: seniors choose first, then juniors, then sophomores, then freshmen.

Two prior systems were tried and both failed, for instructive reasons:

**Attempt 1 — Google Form.** Students picked their grade and ranked 1st–4th choice trip.
- Good: rock solid, never crashed. Students could edit their responses after submitting, which mattered because once friend groups started talking, people wanted to change their picks to be with friends.
- Bad: no way to see who hadn't filled it out yet. Sorting ~500 people into groups by hand afterward was manual, slow work.

**Attempt 2 — A dedicated signup platform.** Had a "live" counter showing spots remaining per trip.
- Good: transparency into how full a trip was.
- Bad: catastrophic under load. All ~500 students hit it at once, and because two students could both see "1 spot left" and both click at nearly the same instant, **both were told they got the spot** — actual overbooking that caused real problems on the event day itself. There was no ranked choice (first/second/third/fourth) at all. Editing wasn't possible. Seniority priority was "enforced" only by giving upperclassmen the link earlier — which immediately broke once students forwarded the link to underclassmen friends.

**The diagnosis**: the second system's failures aren't really separate bugs — the live spot-counter and the race-condition overbooking are *the same mechanism*. Whenever many people can act on one shared, live, mutable number at the same instant, someone's view of it is stale by the time they act — no amount of server capacity fixes that, because it's a logic problem, not a speed problem.

**The fix, and the single most important architectural decision in this project**: students never claim a seat directly or live. Instead, they submit **ranked preferences** into their own private record (no shared state, no race condition possible no matter how many students submit simultaneously). After a submission window closes, a **batch algorithm** — not live clicking — assigns every seat at once from everyone's preferences together. This converts an unreliable real-time adversarial problem into a boring, deterministic, offline computation, and it's what makes every other good property (transparency, editability, correctness) achievable at the same time without them conflicting.

---

## 2. Core requirements, in the requester's own words (compressed from working sessions)

- Waivers should be part of the same system: a PDF waiver template available for download, and a place for students to upload their signed copy back — not a separate e-signature product, just file upload through the same portal.
- The school has a full list of every student's email address, which can be cross-referenced against submissions to know who hasn't responded.
- The rollout should happen in daily grade-based **waves**: Monday = seniors, Tuesday = juniors, Wednesday = sophomores, Thursday = freshmen. Each day, that grade must submit a ranking (or explicitly opt out) by 11:59 PM, after which nothing can be changed. Overnight, an algorithm sorts that day's grade into trips using **whatever capacity is left** after previous waves.
- It is **not possible** to have live transparent spot-counts, ranked-choice preferences, *and* unrestricted after-the-fact changes all fully automated at once without breaking one of them — trying to force all three live and automated is what broke Attempt 2. The resolution: publish the trip list a bit before waves open so friend groups can coordinate informally ahead of time, and treat post-lock changes as a small manual/email-driven process handled by a human, not an automated feature.
- Want to simulate roughly 100 students signing up concurrently against ~5 test trips before going live with real students, to prove the system holds up under real simultaneous load — not just tested one submission at a time.

---

## 3. Decisions locked during design discussion

These were explicitly decided through Q&A and should be treated as settled, not re-litigated by the build:

- **Sorting method**: within each wave, students are placed via a **pure random lottery** — not first-submitted, not any other tiebreak. Every student in that grade who submitted is shuffled into a random order; walking through that order, each student gets their highest-ranked choice that still has an open seat.
- **Visibility during the open window**: students can see **remaining-seat counts per trip only** — never names of who else has claimed a seat. This is deliberate: it keeps the platform from becoming a visible social-pressure leaderboard. Friend coordination is expected to happen socially (texting, talking) before/during the window, aided by publishing the trip list in advance — not by watching the site.
- **Waiver handling**: a PDF waiver form is downloadable from the site; students upload their signed copy back through the same portal. No legally-binding e-signature integration — this is a school field-trip waiver, not a medical consent form, so a simple upload is the right level of effort. The backend independently tracks two completion flags per student — *ranked their trips* and *uploaded a waiver* — since a student could do one without the other.
- **Non-responder handling**: after a wave locks, any student in that grade with **no submission at all** is not silently folded into the random lottery. They are surfaced to the owner (see roster/notes below) for **manual** assignment, so the owner can check the roster's notes field (e.g. allergy or safety info) before placing them anywhere. Students who *did* submit but didn't get any of their 4 ranked choices (all full) are a separate, narrower case — flagged after the lottery runs, for the owner's attention, distinct from full non-response.

---

## 4. Data model

Relational database (Postgres). Five core tables, plus one access-control table:

**`roster`** — the master list of all ~500 students. This is the single source of truth for two things at once: who is allowed to log in / submit at all, and the denominator for non-responder tracking (`roster MINUS submissions` = who's still missing). Imported once (or once per year) via CSV upload through the admin dashboard.
- `name`, `email` (unique), `grade` (senior/junior/sophomore/freshman — entered from official school records, this is authoritative), `notes` (freeform text, human-read-only — see §7)

**`trips`**
- `name`, `description`, `capacity`
- `seats_filled` / `seats_remaining` are always **computed** from counting `assignments` rows, never stored directly — this guarantees the number can never drift out of sync with reality.
- `chaperone_teacher_email` (nullable) — which teacher this trip is attached to, for the teacher permission tier. Assignable/reassignable anytime by the owner, independent of trip creation.

**`submissions`** — one row per student, overwritten on edit (not append-only; only the current answer matters).
- `student_email`, `trip_choice_1`/`2`/`3`/`4` (or `opted_out` flag), `submitted_at`, `last_edited_at`

**`assignments`** — the outcome, once computed.
- `student_email`, `trip_id`, `assigned_at`, `assignment_method` (`lottery` / `manual_admin_override` / `manual_non_responder_placement`)
- Recording *how* an assignment happened is what lets the dashboard distinguish "the algorithm did this" from "the owner moved them," which matters for trust and for answering questions later (e.g. a parent asking why their kid is on a particular trip).

**`change_log`** — append-only audit trail.
- `who` (admin email), `action`, `student_email`, `from_trip`/`to_trip`, `timestamp`
- Every manual action (move, override, re-sort) is attributed here. This is what makes giving the owner full unrestricted override power *safe* rather than reckless — nothing is silently changed; everything overridden is traceable.

**`admin_roles`** — access control, editable **only by the owner account** (see §6).
- `email`, `role` (`owner` / `staff_admin` / `teacher`), `trip_id` (only relevant for `teacher` role — which trip they're attached to)

---

## 5. Waves and the timeline

| Wave | Who | Opens | Closes | Overnight |
|---|---|---|---|---|
| 1 | Seniors | Mon 8:00 AM | Mon 11:59 PM | Seniors assigned via lottery |
| 2 | Juniors | Tue 8:00 AM | Tue 11:59 PM | Juniors assigned into remaining seats |
| 3 | Sophomores | Wed 8:00 AM | Wed 11:59 PM | Sophomores assigned into remaining seats |
| 4 | Freshmen | Thu 8:00 AM | Thu 11:59 PM | Freshmen assigned into remaining seats |

The trip list (names, descriptions, capacities — not live counts yet) is published **before Wave 1 opens**, so friend groups can talk and coordinate choices in advance.

Wave-gating is enforced by the system itself — checking "is this student's grade the one whose wave is currently open" — not by controlling who has the link. This is the direct fix for Attempt 2's failure, where priority was just "who got the link first" and broke the moment it was shared.

**Beyond the four waves, there are three further dates/phases, each gating a different permission — this distinction matters and should not be collapsed into one "locked" flag:**

1. **Submission lock** (each wave's 11:59 PM) — that grade can no longer submit or edit their own ranking. Stored as a real, enforced timestamp per wave.
2. **Roster reveal** (proposed: the Friday after all four waves close) — a *new* permission turns on: students can now see the **names** of who else is on their assigned trip (not before this point — before reveal, they only ever saw counts). Stored as a real, enforced timestamp (`roster_reveal_at`).
3. **Change-request window** (the week following reveal) — students who want a change can't self-serve; they email the owner, who manually moves them via the CLI tools in §7, consulting `change_log`/capacity as normal.
4. **Final lock** (~1 week after that) — this is a **social convention, not a technical restriction**. The "email me for a change" instructions simply stop being shown to students in the UI after this date. The owner's manual-move capability is never actually revoked — it remains available indefinitely for emergencies — but this is intentionally not advertised. Do **not** build a technical permission removal for the owner role at this stage; build only the UI-copy change (hide the "request a change" instructions after this date).

---

## 6. Permissions — four tiers

| Capability | **Owner** (site builder) | **Staff admin** | **Teacher** | **Student** |
|---|---|---|---|---|
| See all trips + live remaining seats (counts only) | ✅ | ✅ | ✅ (counts only, for trips not theirs) | ✅ |
| See who hasn't submitted yet (non-responders) | ✅ | ✅ | ❌ | ❌ |
| See waiver status, all trips | ✅ | ✅ | own trip only | own status only |
| See names/emails, all trips | ✅ | ✅ | own trip only | ❌ |
| See names/emails/waiver status for their own assigned/chaperoned trip | ✅ | ✅ | ✅ | — |
| See their own trip's roster (names) | — | — | — | ✅, only after `roster_reveal_at` |
| Move any student, any trip | ✅ | ❌ | ❌ | ❌ |
| Edit trip capacity | ✅ | ❌ | ❌ | ❌ |
| Grant/revoke staff-admin or teacher access, assign teacher↔trip | ✅ | ❌ | ❌ | ❌ |
| Force/re-run the lottery sort | ✅ | ❌ | ❌ | ❌ |
| Import/update the master roster CSV | ✅ | ❌ | ❌ | ❌ |
| Export full roster (CSV) | ✅ | ✅ | own trip only | ❌ |

**This year, access-granting is single-owner by explicit design choice** — not a technical limitation, a deliberate one. Only the owner's account can write to `admin_roles`. Staff-admins and teachers get **no settings/access-management screen at all** — they simply have the capabilities the table above lists. The reasoning (stated directly by the requester, worth preserving verbatim in spirit): faculty are not very tech-savvy and are notoriously inconsistent about recognizing/tracking students; having exactly one person accountable for every access change is simpler to reason about than reconciling changes made by several people, and is not about restricting others so much as reducing the owner's own tracking burden. Ownership transfer (e.g. at graduation) is a real future institutional question but is explicitly **out of scope for this year's build** — do not build a transfer-of-ownership flow now.

**Extensibility note for future years**: the table above is intentionally implemented as a clean, centralized permission-check (tier → capability → boolean), even though only the owner can *assign* people to tiers this year. This means that if a future year decides, say, "staff-admins should be able to move students too," that's a small, localized code change — not a redesign. Do not build a UI for editing the *definitions* of what each tier can do (that's a meaningfully bigger, riskier feature); just keep the implementation clean enough that it's an easy future patch.

---

## 7. Authentication and grade derivation

The school uses **Google Workspace** for student accounts (domain: `presentationhs.org`). Login should be **Google OAuth restricted to this domain** — no separate password system, no email-sending/magic-link service needed.

**Email format**: `[first initial][lastname][optional disambiguation digit].[2-digit graduation year]@presentationhs.org`
- Example: `amehta.27@presentationhs.org`
- Collision case (same first-initial + lastname + grad year already exists): a digit is appended before the dot, e.g. `amehta1.27@presentationhs.org`.

**Grade is derived from the graduation-year suffix, relative to a single configured value** — not hardcoded, since this shifts every year:
- Config: `current_senior_grad_year` (update once per year, one place).
- `offset = grad_year_in_email − current_senior_grad_year`
- `offset 0` → senior, `1` → junior, `2` → sophomore, `3` → freshman.
- `offset` negative or `> 3` → invalid/graduated account, reject at login rather than guessing.

**Login is a two-factor check, not just email parsing** — both must agree:
1. Email must be present in the `roster` table (the CSV-imported master list) — this is the **authoritative** source for grade and for "is this person allowed to sign in at all."
2. The grade **parsed from the email suffix** must match the roster's recorded grade for that student.
3. If either check fails — not on roster at all, or roster-grade disagrees with parsed-grade — **block login and flag the mismatch for the owner's review**, rather than resolving it automatically either way. This single check catches several distinct real-world problems identically (a transfer student, a data-entry typo in the roster, an actual access attempt) — all worth a human look, none worth silently deciding.

---

## 8. The roster CSV and the notes field

The owner imports a CSV once (or once per year) via the admin dashboard:

```
name, email, grade, notes
Ananya Mehta, amehta.27@presentationhs.org, senior, ""
Jordan Lee, jlee.28@presentationhs.org, junior, "severe horse allergy - avoid horseback trip"
```

- `notes` is **freeform and never parsed or matched by any code** — it is not used to auto-exclude students from trips. The system does not attempt to understand its contents.
- Its one job is to **surface at the exact moment a human is about to make an assignment decision for that student** — specifically, when the owner is manually placing a non-responder (§3) or reviewing a manual move. This keeps a safety-relevant judgment call (e.g. "don't put this kid on the horseback trip") in human hands, where it belongs, rather than pretending the system can safely automate it.
- The owner may update individual notes later (e.g. after sending a short pre-event form asking students to flag anything relevant) — expect this to be a small number of manual edits, not a bulk process.

---

## 9. Admin interface — two distinct surfaces, deliberately split

The owner has never managed a database or deployed an app before, but is comfortable with CLI commands if they're specific and guided, and wants raw SQL access as well — both to learn and to have available while experimenting pre-launch. Split by **environment**, not by taking either option away:

- **Local/dev database (before real student data exists)**: give the owner genuine raw SQL access — a local Postgres instance (or a dev branch/project on whichever host is chosen) reachable directly via `psql` or a simple GUI client (e.g. TablePlus, or Supabase's/Neon's own built-in SQL editor if using their hosted free tier for dev too). This is explicitly a learning and experimentation environment: seed it with fake data, run arbitrary queries, break things freely. Claude Code should set this up early and walk the owner through connecting to it and running a few example queries, as an actual mini-lesson, not just a config step.
- **Production database (once real student/roster data is loaded)**: the CLI command set below (Surface 2) is the **intended everyday interface** once this is live with real students — not because raw access is technically blocked, but because the CLI's validation-plus-logging (capacity checks, `change_log` writes) is what makes "full control over everything" safe to exercise quickly during a real, time-pressured event without a slip of the finger overbooking a trip. The owner should still be able to reach production via raw SQL if genuinely needed (this is the owner's own database, on the owner's own account) — but the CLI should be positioned as the fast, safe default, with raw access as a deliberate, occasional fallback rather than the routine tool.

Do not build a drag-and-drop visual admin UI in either case — a plain table view is still the goal for browsing (Surface 1 below).

**Surface 1 — Viewing (web dashboard, read-only, plain lists)**
- A master overview: every roster student, their grade, current submission status, waiver status, and current trip assignment (if any) — sortable and filterable (e.g. "show me juniors who haven't submitted"), exportable to CSV on demand.
- Per-trip roster view (names, emails, waiver status) scoped per the permission tier of whoever's viewing.
- No animations, no drag-and-drop — a plain, information-dense table is the explicit goal.
- The CSV export satisfies "I want a master spreadsheet" — the database is the one source of truth; any spreadsheet is a point-in-time export of it, not a separately maintained file that could drift.

**Surface 2 — Mutating (a small number of specific, purpose-built CLI commands)**
Each command does exactly one well-defined thing, validates before acting, and writes to `change_log` automatically. Suggested minimum set:
- `import-roster <csv-path>` — load/update the master roster.
- `move-student <email> <trip>` — reassign a student; checks destination capacity, warns (but allows, with confirmation) on overbook, since real exceptions do come up (e.g. accessibility, sibling grouping).
- `assign-non-responder <email> <trip>` — same capacity check; surfaces that student's `notes` field before confirming.
- `run-sort <wave>` — triggers the lottery algorithm for a wave manually (used if the automatic scheduled run needs to be redone, or run early for testing).
- `set-capacity <trip> <n>` — edit a trip's seat count.
- `grant-role <email> <role> [<trip-if-teacher>]` — owner-only; writes to `admin_roles`.

This gives the owner real power ("full control over everything," as requested) through **safe, narrow, logged operations** as the everyday production tool — meaningfully safer than a GUI with drag-and-drop, since there's no "dropped it on the wrong row" failure mode, and it's scriptable for batch changes if ever needed — while still leaving genuine raw SQL access available (dev environment freely, production as a deliberate fallback) per the owner's request to actually learn database management hands-on through this project.

---

## 10. The assignment algorithm (per wave, run automatically overnight)

1. Take every student in that grade with a **submitted** ranking (opted-out students and non-responders are excluded from this automatic step — see §3).
2. Generate a **fresh random shuffle** of those students (a new lottery order each wave — never reused or seeded from anything predictable).
3. Walk through students in that shuffled order. For each student, assign their **highest-ranked choice that still has an open seat**.
4. If a student's all 4 choices are full by the time it's their turn, do **not** silently place them in an arbitrary trip — flag them for the owner's manual attention (distinct from the non-responder flag, since this student did participate).
5. Run inside a **single atomic database transaction** — it either fully completes or fully doesn't, so there's never a half-assigned intermediate state visible to anyone.
6. Every resulting row in `assignments` should record `assignment_method: lottery` so it's distinguishable later from manual moves.

Trigger: automatic (scheduled job) at each wave's close, so the process doesn't depend on a human being awake at midnight — plus the `run-sort` manual CLI command as a fallback/re-run option, which should snapshot the prior state before overwriting so a mistaken re-run is recoverable in spirit even if not literally one-click undo.

---

## 11. Stack

Chosen for: **free tier sufficient at this scale**, **no self-managed server**, **owner's own accounts** (not the school's IT infrastructure, matching the "entirely in my hands" requirement), and buildability by Claude Code with the owner mostly approving/running guided steps rather than hand-writing infrastructure config.

| Piece | Choice | Why |
|---|---|---|
| App framework | **Next.js** | Frontend and backend (API routes, the sort job) in one project/repo/deploy — fewer moving parts for a solo, first-time maintainer. |
| Database | **Postgres**, hosted on **Supabase** or **Neon** (free tier) | Matches the relational data model directly. Free tier is wildly beyond what a few thousand rows (500 students × 25 trips) needs. |
| File storage (waivers) | **Supabase Storage** (same account as DB, if Supabase is chosen) | One fewer account/service to juggle. |
| Hosting/deploy | **Vercel** (free tier) | Built by the Next.js team; deploy is close to "push to GitHub, it's live" — extends the owner's existing GitHub-Pages-level experience into a real backend app. Free tier easily handles a ~500-person burst. |
| Scheduled overnight sort | **Vercel Cron** (same free tier) | No separate job-scheduling service needed. |
| Auth | **Google OAuth**, restricted to `presentationhs.org` | Matches §7. No email-sending service, no magic-link expiry/spam risk during a time-sensitive window. |

**Explicitly rejected**: Google Forms + Sheets + Apps Script. It's free and already trusted by the school, but Apps Script execution-time quotas and concurrent-edit conflicts on a shared sheet are a bad fit for "~500 people submitting inside a 24-hour lottery window with role-based dashboards" — the team would be fighting the tool's limits rather than building the actual spec. The stack above is equally free and is architecturally suited to this problem.

---

## 12. Build instructions for Claude Code — build and deploy a live first pass

**The goal of the first pass is a genuinely deployed, working application** — not a local-only scaffold waiting for a separate "deploy" step later. Concretely, that means:

1. Project root is a local folder named `LAI`, where Claude Code is initialized. Create a **public** GitHub repo, also named `LAI`, and set it as the remote — Claude Code has full permission to create, edit, commit, and push to it throughout the build.
2. Set up the Next.js project and Postgres schema (§4) matching the data model exactly.
2. Wire up Google OAuth restricted to the school domain, with the two-factor roster/grade check from §7.
3. Build the roster CSV import (owner-only).
4. Build the student-facing flow: browse trips (pre-wave), submit/edit ranked choices during an open wave, see live counts-only, upload waiver.
5. Build the wave-gating logic (§5) as real enforced checks, not UI-only restrictions.
6. Build the lottery algorithm (§10) as a scheduled job, plus the manual `run-sort` fallback.
7. Build the two admin surfaces from §9 — read-only dashboard, and the CLI command set — with the four-tier permission checks from §6 enforced server-side (not just hidden in the UI).
8. Build the `change_log` and ensure every mutating action writes to it.
9. **Deploy to Vercel and connect the live database** — walk the owner through creating the necessary free-tier accounts (GitHub is already set up; Vercel, Supabase/Neon, and Google Cloud Console OAuth credentials will need to be created) and get a real, reachable URL live, even if trip data is still placeholder/test content at this stage.
10. Build the simulation harness from §13 and run it against the live-deployed instance (not just locally) to prove the deployed system holds up, before any real student data is loaded in.

Since the owner has not done this kind of deployment before, narrate each setup step plainly as it happens (what account is being created, why, what the free tier limits are) rather than assuming familiarity — but keep moving forward autonomously where a step doesn't require an owner decision.

---

## 13. Simulation / test harness requirement

Before any real student is allowed near this system, build and run a test that:
- Creates ~100–150 fake student accounts (fake but valid-format emails, distributed realistically across the 4 grades) and 5 test trips with realistic capacity (e.g. 20 seats each — demand should meet or slightly exceed supply, the interesting case).
- Fires many **simultaneous** ranked submissions within one simulated wave window — real concurrent load, not sequential one-at-a-time testing — to prove no double-booking and no crash under the exact kind of load that broke Attempt 2.
- Runs the lottery assignment against that batch and verifies: every seat correctly filled, no trip over capacity, no student assigned twice, and the "got none of their 4 choices" flag correctly triggers for the handful of students it should.
- Confirms a test account **outside** the currently-open wave (e.g. a simulated freshman during the simulated senior wave) is correctly blocked by the system itself, not just by convention.
- This becomes both the pre-launch proof-of-concept for the administration and a reusable regression test for any future code changes.

---

## 14. Genuinely open questions (do not guess on these — confirm with the owner before or during build)

- **Non-responder handling detail**: this doc assumes non-responders are surfaced to the owner for manual placement (consulting `notes`) rather than being folded into the automatic lottery — confirm this is exactly right before building it as automatic-exclusion.
- **Accessibility / device constraints**: students likely use school-issued Chromebooks (Chrome browser) — worth a quick confirmation, but no unusual constraints are expected here.
- **Target launch date**, to know how much runway exists for the simulation pass and any fixes it surfaces.
- **Roster CSV cadence**: assumed to be a once-per-year import, not a live sync with any school student-information system — confirm no live sync is expected.

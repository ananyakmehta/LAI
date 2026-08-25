# Learning in Action — UI Spec by Role

Companion document to the main design/handoff doc. This covers **what each role sees and can do, screen by screen** — not visual styling (colors, spacing, animation), which is left to normal design judgment. The guiding principle throughout: **show only what's relevant and actionable to that person, right now** — not every piece of data the system happens to know, and not context about phases/grades that don't concern them. Resist adding navigation, tabs, or visible data "just in case" — every extra thing shown is something the person has to parse before finding what they actually need.

---

## 0. A policy change from the main design doc — read first

**Students must never see the names of who else is on their assigned trip — not before lock, not after, not ever, at any point.** This was originally going to be revealed after all waves closed (a `roster_reveal_at` date), but the school has explicitly decided against this. **Remove `roster_reveal_at` entirely** — there is no second reveal phase for students. A student's own trip view shows the trip they're on, never a list of trip-mates.

This is a deliberate school-administration decision (avoiding social pressure/exclusion dynamics around visible trip rosters), not an oversight — worth a code comment where relevant so a future maintainer doesn't "helpfully" add it back.

---

## 1. Student view

Students have exactly one thing they come to this app to do, at any given time: **find out their own status and, if it's their turn, act on it.** The view is a single page whose content changes based on which of four states the student is currently in — not four different screens, one screen with four states.

**State A — Before their wave has opened.**
- Shown: the full trip list (name, description — not live counts yet, since counts aren't meaningful until submissions exist) so friend groups can browse and discuss ahead of time.
- Shown: their wave's opening date, simply and briefly (e.g. "Your grade's signup opens Wednesday at 8:00 AM").
- Not shown: anything about other grades' waves, whether other grades have opened/closed, or any indication of "whose turn it is" beyond their own.
- Waiver upload is available in this state already — it's not gated to their wave opening (per the main doc, this can be done anytime).

**State B — Their wave is open (they can submit/edit).**
- Shown: the trip list, now with **live remaining-seat counts per trip** (numbers only, never names — this was already locked in the main design doc and still applies here).
- Shown: a simple ranked-choice form — pick 1st through 4th choice — or an explicit "I'm not going" opt-out.
- Shown: their deadline, plainly (e.g. "Submit by tonight, 11:59 PM").
- If they've already submitted once, the form is pre-filled with their current answer and freely editable — re-submitting overwrites, it doesn't create a second entry.
- Waiver upload/status still available here.

**State C — Their wave has closed, not yet sorted.**
- Shown: a simple "you're all set, results will be posted once sorting completes" state — no countdown needed beyond this, nothing actionable.
- This state should be short-lived (overnight) but the app should handle a student checking during it gracefully rather than showing an error or blank state.

**State D — Assigned (after their wave's overnight sort).**
- Shown: their assigned trip's name, description, and any logistics info (time/location) that trips carry — this is their forever-view from this point forward.
- **Not shown, ever: any list of other students on the trip.** Just the trip itself.
- Not shown: other trips' remaining counts, or the rest of the trip catalog — once assigned, the rest of the trip list is no longer relevant to them (per the earlier decision), so don't keep displaying it.
- Waiver status still visible/actionable here if still outstanding.
- A short, low-emphasis note on how to request a change (email the owner) — should visually fade out / stop appearing entirely once the "final lock" UI-convention date passes (per main doc §5), since after that point change requests aren't being solicited even though the owner can still act on them privately.

**Universal, in every state**: their name/grade (for their own confirmation, not editable by them), and waiver upload status. Nothing about `admin_roles`, other students, other grades' progress, or system internals should ever be reachable from the student view, regardless of state.

---

## 2. Teacher view

A teacher has one job in this app: **check on the people going on the trip they're chaperoning.** Single fixed page, no navigation, no tabs — confirmed explicitly, don't add sections "for future flexibility."

**Shown:**
- The name of the trip they're attached to (`chaperone_teacher_email` match).
- A simple list of every student currently assigned to that trip: name, email, waiver status (submitted / not yet).
- A count of confirmed students vs. trip capacity for their own trip.
- **For every other trip**: name and a remaining-seats **count only** — no names, no waiver info. This lets a teacher get a general sense of how full things are without seeing into other trips' rosters.

**Not shown:**
- Non-responder lists (who hasn't submitted at all) — that's a staff-admin/owner capability, not a teacher one.
- Any move/edit controls — teachers are read-only everywhere, including for their own trip's roster.
- Any other teacher's assignment, or which teacher is attached to which trip beyond their own.

**Edge case worth handling explicitly**: a teacher with no trip assigned yet (before the owner has set `chaperone_teacher_email` for any trip) should see a plain "you haven't been assigned a trip yet" state rather than an error or empty table.

---

## 3. Staff-admin view

Staff-admins need the same *breadth* of visibility as the owner (all trips, all students, all waivers, non-responders) but **none of the mutating controls**. Structure this as a few clearly separated sections, per the earlier decision — this maps naturally onto the "views" from the main doc's Surface 1:

**Section: Roster overview**
- Every student in the master roster: name, email, grade, submission status, waiver status, current trip assignment (if sorted).
- Sortable/filterable — the most useful default filters are "not yet submitted" and "waiver not uploaded," since chasing down stragglers is the actual job here.
- Exportable to CSV.

**Section: Trips overview**
- Every trip: name, capacity, seats filled/remaining, and the full list of currently assigned students (names, not just counts — staff-admin has full visibility, unlike teachers).
- Waiver status visible per student within this view too.

**Not shown / not available anywhere in this role:**
- No move/reassign controls, no capacity-editing controls, no access-management (`admin_roles`) screen, no trigger for re-running the sort. If a staff-admin needs any of these, the workflow is "email the owner" — same as students requesting changes, just for a different category of request. This should be true even if a staff-admin is looking directly at a problem (e.g. sees a student needs to move trips) — they can see it, flag it, but the actual action is owner-only.

---

## 4. Owner view (you)

The owner needs everything staff-admin has, **plus** every mutating capability from the main doc (§6, §9), **plus** the access-management and system-level controls nobody else can see at all. Same sectioned structure as staff-admin, with additional sections layered on:

**Sections shared with staff-admin**: Roster overview, Trips overview (same content as above).

**Section: Actions / change log**
- A visible, readable log of every manual action taken (who, what, when, from→to) — this is `change_log` made visible in the UI, not just a database table. Useful for the owner's own memory as much as for accountability.
- Any pending "flagged for manual attention" items surfaced prominently here: non-responders needing placement (with their `notes` field shown inline, per the horse-allergy safety case), and students who submitted but got none of their 4 choices after a sort.

**Section: Access management**
- The only place `admin_roles` is visible or editable at all — visible to no other role, not even staff-admin.
- List of current staff-admins and teachers (with their assigned trip, for teachers), and the ability to add/remove/change these.
- This section should not exist, even in a hidden/disabled form, for any other role — it's not a matter of graying out buttons for staff-admin, the section itself shouldn't be reachable.

**Note on the CLI vs. dashboard split (from the main design doc, still applies)**: this dashboard section is where the owner *sees* everything, including flagged items and the change log. The actual mutating actions (move-student, assign-non-responder, run-sort, grant-role, etc.) are the CLI commands specified in the main doc — the dashboard's job here is surfacing what needs the owner's attention, not necessarily embedding every action as a clickable button. If it's simpler for a first pass to add basic action buttons to this dashboard that just call the same underlying logic as the CLI commands, that's a reasonable enhancement — but the CLI remains the baseline, guaranteed-available interface either way.

---

## 5. Summary table — what's visible where

| | Student | Teacher | Staff-admin | Owner |
|---|---|---|---|---|
| Own status/assignment | ✅ | — | — | — |
| Names on their own assigned trip | ❌ **never** | ✅ (their trip only) | ✅ (all trips) | ✅ (all trips) |
| Other trips — counts only | ✅ pre-assignment only | ✅ | ✅ | ✅ |
| Other trips — names | ❌ | ❌ | ✅ | ✅ |
| Non-responder list | ❌ | ❌ | ✅ | ✅ |
| Change log | ❌ | ❌ | ❌ | ✅ |
| Access management screen | ❌ | ❌ | ❌ | ✅ (only role that can see this exists) |
| Mutating actions (move/sort/capacity/roles) | ❌ | ❌ | ❌ | ✅ |

---

## 6. Implementation notes for Claude Code

- Update the main data model / permissions doc: **remove `roster_reveal_at`** and any logic gating a student-visible roster reveal. Replace with: student trip-roster visibility (names) is permanently owner/staff-admin/teacher-only, never student-facing, at any timestamp.
- The student view should be built as **one route with conditional state rendering** (states A–D above) rather than four separate pages — the state is derived from wave-status + submission-status + assignment-status, not a separate flag to maintain.
- Enforce all "not shown" rules **server-side** (API responses should simply not include the data a role isn't allowed to see), not just hidden in the frontend — a curious student inspecting network requests should not be able to see other students' names by reading an API response meant for a different role.

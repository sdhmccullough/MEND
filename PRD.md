# Mend — Injury Recovery Tracker

**Product Requirements Document · v0.1 (draft)**
Author: Claude, for Sterling McCullough · Date: 2026-08-06
Working name: **Mend** (folder: `Injury Tracker`; rename freely — "Rebound" and "Recoup" were runners-up)

---

## 1. Purpose

A private, two-user PWA for tracking an injury recovery end to end: physical therapy sessions and progress, medications (schedule, adherence, and a backfilled historical record), and all upcoming medical appointments pulled from Google Calendar — unified on one in-app calendar. Built for Sterling and his wife, installable on both phones, living in a private GitHub repository.

This is the direct sibling of **PayDay** (`../PayDay App`). PayDay proved the pattern: React + TypeScript + Vite PWA, Firebase Auth + RTDB with a shared "household," schema normalizers, offline-tolerant sync, invite links, and a locked-down sensor write path for machine-generated suggestions. Mend reuses that architecture nearly wholesale and swaps the domain.

### Why build it (vs. a meds app off the shelf)

Off-the-shelf med reminders don't combine PT progress, appointment aggregation, spouse co-tracking, backfilled history, and — the differentiator — a structured intake path for audio-dictated PT logs via the Hermes agent. The PayDay codebase means the expensive parts (auth, sync, household sharing, PWA plumbing, offline) are already solved patterns.

---

## 2. Users & Access

| User | Role | Access |
|---|---|---|
| Sterling | Patient / owner | Full read-write; owns household; connects Google Calendar |
| Wife | Care partner | Full read-write via invite link (PayDay's invite-token flow, reused) |
| Hermes agent | Machine writer | Write-only to a staging `inbox` node — mirrors PayDay's UDM presence-sensor pattern: suggestions only, never auto-applied |

Sign-in is Google (popup-first, redirect fallback — lift `store/auth.ts` as-is). Both phones install the PWA from Firebase Hosting. "Sign up" is just first sign-in; the household model handles the pairing.

---

## 3. Goals / Non-Goals

**Goals**

1. One place to answer: *What do I take today, did I take it, when is my next appointment, and am I actually getting better?*
2. Medication record that is trustworthy enough to hand to a provider — including the backfilled period.
3. PT session logging fast enough to do in the parking lot after a session — and eventually hands-free via Hermes audio.
4. Both spouses see the same live state (PayDay's RTDB sync).
5. Private: private repo, locked Firebase rules, no analytics, no third parties beyond Google.

**Non-Goals (v1)**

- Not a general health platform — one injury, one recovery arc (schema allows more later).
- No HIPAA posture; this is personal record-keeping, not a medical device. No dosing advice, no interaction checking (flag as a possible later integration, e.g. openFDA).
- No write-back to Google Calendar in v1 (read-only; write-back is a v2 candidate).
- No native apps; PWA only, same as PayDay.

---

## 4. Architecture

**Stack (inherit from PayDay unless noted):** React 18 + TypeScript, Vite, Tailwind v4 (`@theme` tokens), Radix primitives, Zustand store with imperative `patchStore`/`readStore`, Recharts, Firebase (Auth, RTDB, Hosting), `vite-plugin-pwa`, Vitest. New: Google Calendar API (read-only) and Firebase Storage (photos, later milestone).

**Patterns to lift verbatim from PayDay:**

- `lib/schema.ts` normalizer discipline — every RTDB snapshot passes through a normalizer; `SCHEMA_VERSION` + `store/migrate.ts` for future migrations.
- `store/sync.ts` household attach/detach, invite tokens, membership verification, sync status badge.
- `database.rules.json` shape — default-deny, per-node member checks, validated writes, and the *sensor* pattern repurposed for Hermes (write one node only, read nothing).
- PWA config: `NetworkOnly` for Firebase traffic, prompt-style update flow, safe-area bottom tab bar.
- Device-local notifications (`lib/notify.ts`) as the reminder baseline.

**New Firebase project** (do not share the PayDay project): separate auth users, rules, and blast radius.

**Repo:** new private GitHub repo `mend` (or `injury-tracker`) under Sterling's account. CI: GitHub Action running `tsc --noEmit && vitest run` on PR; deploy via `firebase deploy` (manual or Action with hosting secret).

### Data model (RTDB, household-scoped)

```
households/$hid/
  meta/            { ownerUid, schemaVersion }
  members/$uid     { email, joinedAt }
  injury/          { title, occurredOn, mechanism, diagnosis, providers{},
                     surgeryOn?, targetMilestones{} }
  meds/$medId      { name, doseText, form, purpose, prescriber,
                     schedule: { kind: 'times' | 'interval' | 'prn',
                                 times: ['08:00','20:00'], startOn, endOn?,
                                 taper?: [{from, to, doseText}] },
                     active, notes, refills? }
  doses/$dateKey/$doseId
                   { medId, plannedAt, takenAt|null, status: 'taken'|'skipped'|'late'|'pending',
                     backfilled: bool, by, note? }
  ptSessions/$id   { at, kind: 'clinic'|'home', exercises: [{name, sets, reps,
                     resistance?, durationSec?}], painPre, painPost, rom?{},
                     therapistNotes?, source: 'manual'|'hermes', by }
  metrics/$dateKey { pain, rom?{joint: degrees}, notes?, by }
  appointments/$id { title, startAt, endAt, kind: 'doctor'|'pt'|'imaging'|'other',
                     location?, source: 'gcal'|'manual', gcalEventId?, notes?,
                     prepNotes?, outcomeNotes? }
  inbox/$id        { type: 'ptSession'|'doseLog'|'metric', payload{...},
                     receivedAt, status: 'pending'|'applied'|'dismissed' }  ← Hermes writes here
  agents/$uid      true                                                    ← grant/revoke, like PayDay sensors
```

Key rules decisions: `doses` validates `status` enum and date-key format; `inbox` is the **only** node the Hermes agent uid can write (and it cannot read anything); `backfilled: true` is immutable once set so the historical record stays honest.

---

## 5. Feature Requirements

### 5.1 Today (home tab)

The daily driver. Shows, in order: next appointment (from the merged calendar), today's med checklist (one tap = taken now; long-press = pick time / skip with reason), today's PT plan or logged session, and a pain quick-log (0–10 slider, one per day, editable). Everything on this screen is a two-tap-max interaction — this is the screen used at 6 AM and in parking lots.

### 5.2 Medications

- **Med list:** add/edit/archive meds with name, dose text, form, purpose, prescriber, and a schedule: fixed times per day, every-N-hours, or PRN. Support an optional **taper** definition (dose changes on dates) — common in injury recovery and almost never handled well by off-the-shelf apps.
- **Dose generation:** planned doses materialize per day from the schedule (client-side, on view/interaction — no server). Missed doses age from `pending` → visibly overdue; never silently auto-marked.
- **Adherence log:** every dose event records who logged it and when — either spouse can log (care-partner logging is a first-class case).
- **Backfill mode:** the record starts **2026-08-05 (yesterday)**. A dedicated backfill flow lets Sterling bulk-enter the period from injury date → today: pick a med, paint taken/skipped across a date grid, coarse times allowed. Backfilled doses carry `backfilled: true` and render with a distinct mark so the provable-live record is distinguishable from reconstructed history.
- **Adherence stats:** per-med and overall %-taken, current streak, 7/30-day trend on the Progress screen.
- **Reminders:** v1 = device-local notifications while the app is open (PayDay's `notify.ts` pattern) + calendar visibility. v2 = real push via FCM (see gap assessment — this is the one place PayDay's pattern is genuinely insufficient).

### 5.3 Appointments + Google Calendar

- **Read-only Google Calendar integration.** OAuth via Google Identity Services (token client, `calendar.readonly` scope) — *separate from Firebase sign-in*; connecting the calendar is an explicit "Connect Google Calendar" action in Settings. Sterling selects which calendar(s) to pull from. Matching events sync into `appointments` with `source: 'gcal'` (sync on app open + manual pull-to-refresh; no server, so no background sync).
- **Filtering:** a configurable keyword/color filter decides which events count as medical (e.g., "PT", "Dr.", clinic names) — with a per-event "include/exclude" override. Don't drag his whole work calendar into a medical app.
- **Manual appointments** are equal citizens (`source: 'manual'`) for anything not on GCal.
- **Per-appointment notes:** prep questions before, outcome/instructions after. The post-visit note is where "doctor said start weaning the brace" lives — this is the connective tissue between visits.
- Either spouse sees all appointments; whose Google account is connected is a settings-level choice (start with Sterling's; support connecting both later).

### 5.4 Calendar (in-app)

- **Month view:** dots per day — appointment dots (by kind) and a med-adherence dot (green = all taken, amber = partial, red = missed, hollow = backfilled). Past and future both navigable.
- **Day view (zoom-in):** the full ledger for that day — every planned dose with status and actual time, appointments with notes, PT session summary, pain score. This satisfies "zoom into a day by day" directly.
- **Week view** optional (v1.1) — month + day covers the stated need.

### 5.5 Physical Therapy & Progress

- **Session log:** date/time, clinic vs. home, exercise list (name, sets, reps, resistance/band, duration), pain before/after, optional ROM measurements per joint, therapist notes. An exercise picker remembers previously used exercises (auto-suggest) so logging a repeat session takes seconds.
- **Home exercise program (HEP):** the prescribed exercise list lives as a template; "Start home session" pre-fills it.
- **Progress screen:** Recharts panels — pain trend (pre/post PT overlay), ROM trend per joint, session frequency vs. plan, med adherence. Milestones (e.g., "full weight bearing," "return to CrossFit") as dated markers on the charts.
- **Hermes audio intake (the modern part):** Hermes (once running) transcribes Sterling's dictated session recap and POSTs structured JSON to `inbox` using a dedicated agent credential — exactly PayDay's UDM sensor design: auth-only key, rules restrict the uid to `inbox` writes, revocable in Settings. The app surfaces pending inbox items as **suggestion cards** ("PT session detected — 4 exercises, pain 6→3. Apply?"); a human always taps Apply. Idempotency via client-supplied `$id`. The inbox schema *is* the Hermes contract — defined here first so the agent has a stable target.

### 5.6 Auth, household, settings

Direct reuse: Google sign-in, household create-on-first-sign-in, invite link for the second phone, leave/rejoin, member management, agent (Hermes) grant/revoke UI, theme toggle, notification toggle. Settings additionally hold: injury profile editor, GCal connection + filters, backfill entry point, data export.

---

## 6. UX & Design

Same design system discipline as PayDay (`globals.css` role tokens, light/dark via system + override, Inter variable, Radix primitives, reduced-motion support, safe-area-aware bottom tabs) with a different personality: **"calm clinical"** — swap PayDay's emerald accent for a recovery-appropriate blue/teal (e.g., `#0d9488` teal or `#2563eb` blue; pick during build with the same contrast validation).

Bottom tabs (mobile-first): **Today · Meds · Calendar · Progress**, gear for Settings. Interactions optimized for one-handed phone use; every logging action ≤ 2 taps from Today. Skeleton/optimistic UI on writes (RTDB latency-compensates already). PWA installed name: "Mend," standalone display, app shortcuts to Today/Meds/Calendar.

---

## 7. Security & Privacy

- Default-deny RTDB rules; every node membership-gated; validated enums/dates like PayDay's rules file.
- Hermes credential can write only `inbox`, read nothing, and is revocable two ways (Firebase Auth user deletion; in-app grant removal).
- Health data in a personal Firebase project is a deliberate, acceptable tradeoff for a private two-person app — but say it out loud: this is **not** HIPAA-anything, and the repo must never contain real data (data lives only in RTDB; repo is code).
- Private GitHub repo; Firebase web config in repo is fine (it's not a secret; rules are the boundary) — but keep the GCal OAuth client ID restricted to the hosting origin.
- No analytics, no error-reporting SaaS in v1.

---

## 8. Milestones

| # | Scope | Exit test |
|---|---|---|
| M0 | Repo, Firebase project, scaffold from PayDay patterns (auth, household, invite, PWA, tabs, tokens) | Both phones signed in to one household |
| M1 | Meds: list, schedules incl. taper, dose generation, Today checklist, **backfill flow** | Record backfilled from 2026-08-05; both spouses logging live doses |
| M2 | In-app calendar (month + day zoom) with adherence dots; manual appointments | Day view shows full dose ledger for any past day |
| M3 | Google Calendar read integration + filters + appointment notes | Real PT/doctor visits appear without manual entry |
| M4 | PT session logging, HEP templates, Progress charts, milestones | A clinic session logged in < 60 seconds |
| M5 | Hermes inbox: rules, agent grant UI, suggestion cards, contract doc | A hand-POSTed JSON payload becomes an applied PT session |
| M6 | Polish: FCM push reminders, photo attachments, PDF export | Push fires with app closed on both phones |

M1 before M2/M3 deliberately: the pill record starts accruing value from day one; calendar integration can trail by a week without losing data.

---

## 9. Proposed Additional Features (beyond the ask)

1. **Provider-visit PDF export** — one tap produces a date-ranged summary (med adherence table, pain trend chart, PT session list) to hand to the surgeon/PT. This is the highest-leverage add: it converts record-keeping into better clinical conversations.
2. **Photo timeline** — incision/swelling/bruising photos with date stamps (Firebase Storage), shown on the calendar day view. Objective visual progress; useful for remote provider questions.
3. **Pain body-map** — tap a body region on a figure instead of typing location; trends per region.
4. **Garmin overlay** — you already wear one: import daily steps/sleep/HR via Garmin Connect export (or API) and overlay on the recovery charts. Activity-vs-pain correlation is exactly the driver-based view you'd want.
5. **Refill radar** — pills-remaining countdown per med from fill date + schedule; warn at 5 days.
6. **Symptom journal** — free-text + tags (swelling, numbness, sleep quality) attached to a day; searchable before appointments.
7. **Appointment prep assistant** — accumulate "ask the doctor" items between visits; they surface on the appointment card.
8. **Streaks & quiet gamification** — adherence streaks and PT-session streaks on Today. You respond to CrossFit-style consistency mechanics; use them.
9. **Care-partner nudge** — if a dose goes >2h overdue, the *other* spouse's device shows it prominently (requires M6 push).
10. **Return-to-sport checklist** — milestone gates (ROM targets, pain-free thresholds) toward CrossFit/MTB return, agreed with the PT and tracked in-app.

## 10. Gap Assessment — what the ask misses

Things I'd flag before you consider this spec complete; said plainly:

1. **Reminders are the weakest link in the PayDay pattern.** Local notifications only fire with the app open — useless for "take your 8 PM dose." A med tracker without reliable reminders is a diary, not a tool. FCM web push (supported on installed iOS PWAs since 16.4) needs a small server component (Cloud Function or scheduled function) to fire on time. Budgeted as M6 but arguably belongs earlier; consider pulling it to M2 if reminders matter more than the calendar view. Interim mitigation: native phone alarms + the app as the record.
2. **No injury baseline defined.** The tracker needs a "what happened" anchor: injury date, mechanism, diagnosis, imaging results, surgery date if any, provider roster. It's in the schema (`injury/`) but you didn't ask for it — without it, progress charts have no day-zero.
3. **PRN and taper meds.** "Cadence" implies fixed schedules, but injury recovery meds are frequently PRN (pain meds) or tapering. The schedule model handles all three kinds — confirm this matches your actual med list before M1.
4. **Backfill honesty.** Backfilled entries must be visually and structurally distinct (`backfilled: true`, immutable) or the record loses credibility with providers — and with you. Also decide backfill granularity: exact times are fiction for last month; "taken, morning" is honest.
5. **Whose calendar?** Appointments may live on your calendar, hers, or a shared family calendar. v1 connects one account with calendar selection; if appointments are scattered across both accounts, that's a v1.1 requirement, not an edge case — decide now.
6. **Hermes contract is on the critical path for audio, but Hermes isn't.** Defining `inbox` schema + rules in M5 means the app never blocks on Hermes' timeline; when Hermes lands, it targets a stable, documented interface. Reverse the dependency — don't let the agent's design drive the app's.
7. **Offline at the clinic.** PT clinics and hospital basements have terrible signal. RTDB latency-compensation covers brief gaps, but test the "log a full session offline, sync later" path explicitly (PayDay's `NetworkOnly` service-worker rule for Firebase means offline writes queue in the SDK, not the SW — same behavior, verify it).
8. **Data lifetime & export.** Recovery ends; the record's value doesn't. JSON export (and the PDF summary) should exist before you stop using the app daily, or the data is stranded in RTDB. Cheap insurance: a scheduled RTDB backup to Storage.
9. **Two-account Google OAuth quota/verification.** An unverified OAuth app in "testing" mode caps at 100 test users and shows scary consent screens — fine for two users, but tokens expire every 7 days in testing mode. Either publish the OAuth app (verification for a sensitive-ish scope) or accept weekly re-consent. This is the most annoying hidden papercut in the whole plan — decide early.
10. **One injury vs. many.** Schema scopes to a single injury arc. If this becomes the family health tracker (kid's broken arm, etc.), `injury/` becomes `injuries/$id` and everything keys off it — a cheap change now, a migration later.

## 11. Open Questions

1. Working name OK? (Affects repo name, PWA name, icon.)
2. What's the actual current med list and cadence? (Drives whether taper/PRN support is M1 or later.)
3. Which Google account holds the medical appointments today?
4. Reminder priority: pull FCM push forward to M2, or is native-alarm interim acceptable?
5. Hermes payload direction: single `ptSession` type first, or also dictated dose logs ("I took my meds") from day one?

---

*Built on the PayDay App architecture (React/Vite/Firebase PWA, household sync, sensor-suggestion pattern). See `../PayDay App` for reference implementations of auth, sync, rules, and PWA config.*

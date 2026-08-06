# Mend — Injury Recovery Tracker

Private two-user PWA for tracking an injury recovery end to end: medications
(schedules, adherence, backfilled history), PT sessions and progress, and
appointments — shared live between two phones. Sibling of the PayDay app;
same architecture (React 18 + TypeScript + Vite + Tailwind v4 + Zustand +
Firebase Auth/RTDB + vite-plugin-pwa), different domain.

See [PRD.md](PRD.md) for the full product spec and milestones.

## Status

- **M0 (scaffold)** — done: auth, household + invite links, PWA shell,
  4 tabs, settings (injury profile, members, theme, notifications, Hermes
  agent grants), rules, CI.
- **M1 (meds + dose engine + backfill)** — next.

## One-time setup (Firebase console)

The code ships with `MEND_PROJECT_ID` placeholders. To go live:

1. [Firebase console](https://console.firebase.google.com) → Add project
   (disable Analytics). Note the assigned project id.
2. Authentication → Sign-in method → enable **Google**.
3. Realtime Database → Create (US region, locked mode).
4. Hosting → Get started.
5. Project settings → Your apps → Add web app → copy the `firebaseConfig`
   into `src/lib/firebase.ts`. **Keep `authDomain` as
   `<project-id>.web.app`** — the firebaseapp.com domain breaks redirect
   sign-in under storage partitioning.
6. Authentication → Settings → Authorized domains: confirm
   `<project-id>.web.app` and `localhost`.
7. Replace `MEND_PROJECT_ID` in `.firebaserc` and both files in
   `.github/workflows/`.
8. Create the private GitHub repo, then run `firebase init hosting:github`
   once to mint the deploy service account + secret (update the secret name
   in the workflows), and grant that service account **Firebase Realtime
   Database Admin** in Cloud Console → IAM so CI can deploy rules.
9. Deploy: `npx firebase-tools deploy`. Open `https://<project-id>.web.app`
   on both phones, sign in, install the PWA; the second phone joins via
   Settings → Invite someone.

Later milestones need more console work (Calendar API + OAuth client for
M3, an Email/Password agent user for M5, Blaze + FCM for M6) — see PRD §8
and the plan.

## Development

```bash
npm install
npm run dev        # Vite dev server
npm run lint       # ESLint
npm test           # Vitest (pure-logic, node env; TZ-sensitive by design)
npm run build      # tsc --noEmit && vite build
```

`?demo=1` on any URL boots demo mode: sample recovery data, no sign-in,
writes fail softly. Preview-channel hosts (`*--*.web.app`) auto-enable it.

`VITE_USE_EMULATORS=1` points Auth/RTDB at local emulators
(`firebase emulators:start --only auth,database`).

## Architecture notes

- **Normalizer discipline**: every RTDB snapshot passes through
  `src/lib/schema.ts` before entering the store. Normalizers are total.
- **Writes are scoped**: mutations in `src/store/sync.ts` update narrow
  paths (multi-path atomic `update()` where a change must be all-or-nothing).
  No optimistic local writes — RTDB latency compensation handles it.
- **Doses**: only *actioned* doses are stored. Planned/overdue are computed
  client-side from med schedules (`lib/doses.ts`, M1). Scheduled-slot ids
  are deterministic (`medId_HHMM`) so both spouses converge on one record.
  `backfilled: true` records are immutable — rules enforce it.
- **Hermes**: the agent uid can write only `inbox/*` items with
  `status: 'pending'`, and read nothing. Suggestions apply only via a human
  tap. Contract doc lands in M5 (`docs/HERMES-CONTRACT.md`).
- **Dates**: all day keys are LOCAL calendar dates (`YYYY-MM-DD`), never
  `toISOString()`. Times of day are `HH:MM` strings; instants are epoch ms.

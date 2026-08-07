// Mend server side — deliberately tiny. Two jobs:
// 1. doseReminders: the one thing a serverless PWA can't do — fire push
//    notifications for due doses while the app is closed (PRD gap #1).
// 2. setHouseholdClaim: stamp each member's uid with their household id so
//    Cloud Storage rules (which can't read RTDB) can gate photo access.

const { onSchedule } = require('firebase-functions/v2/scheduler');
const { onValueCreated } = require('firebase-functions/v2/database');
const admin = require('firebase-admin');

admin.initializeApp();

// Both phones live here; a per-household TZ setting can replace this later.
const TZ = 'America/Denver';
const WINDOW_MIN = 15;

// Routine nudges only during waking hours — ice every 90 minutes must not
// ping at 3 AM.
const QUIET_BEFORE_MIN = 7 * 60; // 07:00
const QUIET_AFTER_MIN = 21 * 60; // 21:00
const WAKING_MINUTES = 16 * 60;

/** Mirrors lib/routines.effectiveCadence: a routine with a daily target
 * but no stated interval gets one spread over a waking day. */
function effectiveCadence(routine) {
  if (routine.everyMinutes > 0) return routine.everyMinutes;
  if (routine.targetPerDay > 1) return Math.floor(WAKING_MINUTES / routine.targetPerDay);
  return 0;
}

function localParts(date, tz) {
  const dateKey = new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(date);
  const hm = new Intl.DateTimeFormat('en-GB', {
    timeZone: tz,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
  return { dateKey, minutes: Number(hm.slice(0, 2)) * 60 + Number(hm.slice(3, 5)) };
}

exports.setHouseholdClaim = onValueCreated(
  { ref: '/households/{hid}/members/{uid}', region: 'us-central1' },
  async (event) => {
    await admin.auth().setCustomUserClaims(event.params.uid, { hid: event.params.hid });
  },
);

// Routine countdowns (the 30-minute ice timer). Runs every minute so the
// alert lands close to the mark; the client can't be relied on because
// the phone is usually locked while the ice is on.
exports.timerAlerts = onSchedule(
  { schedule: 'every 1 minutes', timeZone: TZ, region: 'us-central1' },
  async () => {
    const db = admin.database();
    const households = (await db.ref('households').get()).val() ?? {};
    const now = Date.now();
    const work = [];

    for (const [hid, hh] of Object.entries(households)) {
      const tokens = Object.values(hh.settings?.fcmTokens ?? {})
        .map((t) => t && t.token)
        .filter(Boolean);
      for (const [routineId, timer] of Object.entries(hh.timers ?? {})) {
        if (!timer || timer.notifiedAt || !timer.dueAt || timer.dueAt > now) continue;
        // Stamp first: a duplicate push is worse than a missed retry.
        work.push(
          db.ref(`households/${hid}/timers/${routineId}/notifiedAt`).set(now).then(() => {
            if (tokens.length === 0) return undefined;
            return admin.messaging().sendEachForMulticast({
              tokens,
              notification: {
                title: 'Mend — timer done',
                body: `${timer.label || 'Timer'}: time's up.`,
              },
              webpush: {
                fcmOptions: { link: 'https://mend-467f5.web.app/?tab=today' },
                notification: { icon: '/icons/icon-192.png', badge: '/icons/icon-192.png' },
              },
            });
          }),
        );
      }
    }
    await Promise.all(work);
  },
);

exports.doseReminders = onSchedule(
  { schedule: `every ${WINDOW_MIN} minutes`, timeZone: TZ, region: 'us-central1' },
  async () => {
    const db = admin.database();
    const households = (await db.ref('households').get()).val() ?? {};
    const { dateKey, minutes } = localParts(new Date(), TZ);

    const sends = [];
    for (const hh of Object.values(households)) {
      const tokens = Object.values(hh.settings?.fcmTokens ?? {})
        .map((t) => t && t.token)
        .filter(Boolean);
      if (tokens.length === 0) continue;

      const dayDoses = (hh.doses ?? {})[dateKey] ?? {};
      const due = [];
      for (const [medId, med] of Object.entries(hh.meds ?? {})) {
        if (!med || med.active === false) continue;
        const s = med.schedule ?? {};
        if (s.kind !== 'times') continue;
        if (s.startOn && dateKey < s.startOn) continue;
        if (s.endOn && dateKey > s.endOn) continue;
        for (const slot of Object.values(s.times ?? {})) {
          const [h, m] = String(slot).split(':').map(Number);
          if (!Number.isFinite(h) || !Number.isFinite(m)) continue;
          const slotMin = h * 60 + m;
          // Fire in the window ending at the slot time.
          if (slotMin > minutes - WINDOW_MIN && slotMin <= minutes) {
            const doseId = `${medId}_${String(slot).replace(':', '')}`;
            if (!dayDoses[doseId]) {
              due.push(`${med.name} ${med.doseText ?? ''}`.trim());
            }
          }
        }
      }

      if (due.length > 0) {
        sends.push(
          admin.messaging().sendEachForMulticast({
            tokens,
            notification: { title: 'Mend — dose time', body: due.join(' · ') },
            webpush: {
              fcmOptions: { link: 'https://mend-467f5.web.app/?tab=today' },
              notification: { icon: '/icons/icon-192.png', badge: '/icons/icon-192.png' },
            },
          }),
        );
      }

      // ---- routine care (ice, sling, pendulums) ----
      // Due = daily target unmet and the cadence has elapsed since the last
      // rep. Re-nudge no more often than the cadence itself, so a routine
      // left undone doesn't pester every 15 minutes.
      if (minutes < QUIET_BEFORE_MIN || minutes > QUIET_AFTER_MIN) continue;

      const dayLogs = Object.values((hh.routineLogs ?? {})[dateKey] ?? {});
      const reminded = hh.reminderState ?? {};
      for (const [routineId, routine] of Object.entries(hh.routines ?? {})) {
        if (!routine || routine.active === false) continue;
        const mine = dayLogs.filter((l) => l && l.routineId === routineId);
        if (mine.length >= (routine.targetPerDay || 1)) continue;

        const cadence = effectiveCadence(routine);
        if (cadence === 0) continue;
        const lastRep = mine.reduce((max, l) => (l.at > max ? l.at : max), 0);
        const minsSinceRep = lastRep ? (now - lastRep) / 60_000 : Infinity;
        if (minsSinceRep < cadence) continue;

        const lastNudge = reminded[routineId]?.lastAt ?? 0;
        if ((now - lastNudge) / 60_000 < cadence) continue;

        const left = (routine.targetPerDay || 1) - mine.length;
        sends.push(
          db
            .ref(`households/${hid}/reminderState/${routineId}/lastAt`)
            .set(now)
            .then(() =>
              tokens.length
                ? admin.messaging().sendEachForMulticast({
                    tokens,
                    notification: {
                      title: `Mend — ${routine.label}`,
                      body:
                        lastRep === 0
                          ? `Not done yet today · ${left} to go.`
                          : `Due again · ${mine.length}/${routine.targetPerDay} done.`,
                    },
                    webpush: {
                      fcmOptions: { link: 'https://mend-467f5.web.app/?tab=today' },
                      notification: {
                        icon: '/icons/icon-192.png',
                        badge: '/icons/icon-192.png',
                      },
                    },
                  })
                : undefined,
            ),
        );
      }
    }
    await Promise.all(sends);
  },
);

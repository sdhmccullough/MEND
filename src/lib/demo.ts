// Demo mode for Firebase Hosting preview channels. Preview URLs look like
// mend-xxxx--pr4-branch-hash.web.app — the '--' marks a channel. There,
// sign-in is skipped entirely and the store boots with sample recovery data
// so a PR can be reviewed end-to-end without auth (and without touching
// real data).

import { patchStore } from '../store/useStore';
import { addDays, todayKey } from './dates';
import { DEFAULT_GCAL } from './schema';

export function isPreviewHost(host = location.hostname): boolean {
  return host.endsWith('.web.app') && host.includes('--');
}

/** Demo boots on preview channels, or anywhere via ?demo=1 (handy locally). */
export function isDemoRequested(): boolean {
  return (
    isPreviewHost() || new URLSearchParams(location.search).get('demo') === '1'
  );
}

export function seedDemoStore(): void {
  const today = todayKey();
  const now = Date.now();
  const hoursAgo = (n: number) => now - n * 60 * 60 * 1000;
  const daysAgo = (n: number) => now - n * 24 * 60 * 60 * 1000;
  const injuredOn = addDays(today, -21);

  patchStore({
    demoMode: true,
    authReady: true,
    user: { uid: 'demo-user', email: 'preview@mend.demo' },
    householdId: 'demo',
    ownerUid: 'demo-user',
    syncStatus: 'synced',

    injury: {
      title: 'Right knee — MCL sprain',
      occurredOn: injuredOn,
      mechanism: 'Twisted landing a box jump',
      diagnosis: 'Grade 2 MCL sprain, no surgical repair indicated',
      providers: {
        p1: 'Dr. Reyes — orthopedics',
        p2: 'Sam T. — physical therapist',
      },
      surgeryOn: null,
      targetMilestones: {
        m1: { label: 'Full weight bearing', targetOn: addDays(injuredOn, 28), achievedOn: null },
        m2: { label: 'Return to CrossFit', targetOn: addDays(injuredOn, 84), achievedOn: null },
      },
    },

    meds: {
      'demo-med1': {
        name: 'Naproxen',
        doseText: '500 mg',
        form: 'tablet',
        purpose: 'Anti-inflammatory',
        prescriber: 'Dr. Reyes',
        schedule: {
          kind: 'times',
          times: ['08:00', '20:00'],
          everyHours: null,
          startOn: injuredOn,
          endOn: null,
          taper: [],
        },
        active: true,
        notes: 'Take with food',
        refills: 1,
        noDriving: false,
        variableDose: false,
        fillQuantity: 60,
        filledOn: injuredOn,
      },
      'demo-med2': {
        name: 'Acetaminophen',
        doseText: '500 mg',
        form: 'tablet',
        purpose: 'Pain (as needed)',
        prescriber: '',
        schedule: {
          kind: 'prn',
          times: [],
          everyHours: null,
          startOn: injuredOn,
          endOn: null,
          taper: [],
        },
        active: true,
        notes: '',
        refills: null,
        noDriving: false,
        variableDose: true,
        fillQuantity: 20,
        filledOn: injuredOn,
      },
    },

    doses: {
      [addDays(today, -1)]: {
        'demo-med1_0800': {
          medId: 'demo-med1',
          plannedAt: '08:00',
          takenAt: daysAgo(1),
          units: 1,
          status: 'taken',
          backfilled: false,
          by: 'demo-user',
          note: '',
        },
        'demo-med1_2000': {
          medId: 'demo-med1',
          plannedAt: '20:00',
          takenAt: daysAgo(1),
          units: 1,
          status: 'taken',
          backfilled: false,
          by: 'demo-partner',
          note: '',
        },
      },
      [today]: {
        'demo-med1_0800': {
          medId: 'demo-med1',
          plannedAt: '08:00',
          takenAt: hoursAgo(3),
          units: 1,
          status: 'taken',
          backfilled: false,
          by: 'demo-user',
          note: '',
        },
      },
    },

    ptSessions: {
      'demo-pt1': {
        at: daysAgo(2),
        kind: 'clinic',
        exercises: [
          { name: 'Quad sets', sets: 3, reps: 15, resistance: '', durationSec: 0 },
          { name: 'Heel slides', sets: 3, reps: 10, resistance: '', durationSec: 0 },
          { name: 'Stationary bike', sets: 1, reps: 0, resistance: 'level 3', durationSec: 600 },
        ],
        painPre: 5,
        painPost: 3,
        rom: { 'knee flexion': 105 },
        therapistNotes: 'Cleared to add mini squats next week.',
        source: 'manual',
        by: 'demo-user',
      },
    },

    metrics: {
      [addDays(today, -2)]: { pain: 5, sane: null, rom: {}, notes: '', by: 'demo-user' },
      [addDays(today, -1)]: {
        pain: 4,
        sane: 45,
        rom: {},
        notes: 'Slept better',
        by: 'demo-user',
      },
      [today]: { pain: 3, sane: null, rom: {}, notes: '', by: 'demo-user' },
    },

    appointments: {
      'demo-a1': {
        title: 'PT — Sam T.',
        startAt: now + 2 * 24 * 60 * 60 * 1000,
        endAt: now + 2 * 24 * 60 * 60 * 1000 + 45 * 60 * 1000,
        kind: 'pt',
        location: 'Summit Physical Therapy',
        source: 'manual',
        gcalEventId: null,
        notes: '',
        prepNotes: 'Ask about brace weaning',
        outcomeNotes: '',
      },
    },

    hep: {
      exercises: [
        { name: 'Quad sets', sets: 3, reps: 15, resistance: '', durationSec: 0 },
        { name: 'Straight leg raises', sets: 3, reps: 10, resistance: '', durationSec: 0 },
      ],
      updatedAt: daysAgo(2),
    },

    routines: {
      'demo-r1': {
        label: 'Ice 30 min',
        targetPerDay: 8,
        everyMinutes: 90,
        timerMinutes: 30,
        active: true,
        order: 1,
      },
      'demo-r2': {
        label: 'Elbow out of sling',
        targetPerDay: 3,
        everyMinutes: 0,
        timerMinutes: 0,
        active: true,
        order: 2,
      },
    },
    routineLogs: {
      [today]: {
        'demo-rl1': { routineId: 'demo-r1', at: hoursAgo(2), by: 'demo-user' },
      },
    },
    timers: {
      'demo-r1': {
        label: 'Ice 30 min',
        startedAt: now - 12 * 60 * 1000,
        dueAt: now + 18 * 60 * 1000,
        notifiedAt: null,
        by: 'demo-user',
      },
    },
    protocol: {
      'demo-p1': {
        label: 'Immobilization',
        startDay: 0,
        endDay: 41,
        summary: 'Sling full time including sleep. Elbow out 3× a day.',
        order: 0,
      },
      'demo-p2': {
        label: 'Motion',
        startDay: 42,
        endDay: 83,
        summary: 'Passive then active range of motion as PT directs.',
        order: 1,
      },
    },
    guide: {
      'demo-g1': {
        title: 'Wound care',
        body: 'Keep dressing dry and clean.\nShower OK after day 3 — no direct spray.\nNo soaking until cleared.',
        order: 1,
        updatedAt: daysAgo(1),
      },
    },
    settings: { gcal: DEFAULT_GCAL },
    inbox: {
      'demo-inbox1': {
        type: 'ptSession',
        payload: {
          kind: 'home',
          exercises: [
            { name: 'Quad sets', sets: 3, reps: 15 },
            { name: 'Straight leg raises', sets: 3, reps: 10 },
          ],
          painPre: 4,
          painPost: 2,
        },
        receivedAt: hoursAgo(1),
        status: 'pending',
      },
    },
    agents: { 'demo-agent-uid': true },
    members: {
      'demo-user': { email: 'preview@mend.demo', joinedAt: daysAgo(21) },
      'demo-partner': { email: 'partner@mend.demo', joinedAt: daysAgo(20) },
    },
  });
}

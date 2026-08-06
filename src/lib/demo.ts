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
      },
    },

    doses: {
      [addDays(today, -1)]: {
        'demo-med1_0800': {
          medId: 'demo-med1',
          plannedAt: '08:00',
          takenAt: daysAgo(1),
          status: 'taken',
          backfilled: false,
          by: 'demo-user',
          note: '',
        },
        'demo-med1_2000': {
          medId: 'demo-med1',
          plannedAt: '20:00',
          takenAt: daysAgo(1),
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
      [addDays(today, -2)]: { pain: 5, rom: {}, notes: '', by: 'demo-user' },
      [addDays(today, -1)]: { pain: 4, rom: {}, notes: 'Slept better', by: 'demo-user' },
      [today]: { pain: 3, rom: {}, notes: '', by: 'demo-user' },
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

    settings: { gcal: DEFAULT_GCAL },
    inbox: {},
    agents: { 'demo-agent-uid': true },
    members: {
      'demo-user': { email: 'preview@mend.demo', joinedAt: daysAgo(21) },
      'demo-partner': { email: 'partner@mend.demo', joinedAt: daysAgo(20) },
    },
  });
}

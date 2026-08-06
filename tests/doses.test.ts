import { describe, expect, it } from 'vitest';
import {
  doseTextForDate,
  intervalNextDue,
  lastTakenAtForMed,
  materializeDay,
  medWindowContains,
  plannedSlotsFor,
  scheduledDoseId,
  slotEpoch,
  LATE_THRESHOLD_MS,
} from '../src/lib/doses';
import type { DoseRecord, Med, MedSchedule } from '../src/lib/schema';

type MedOverrides = Omit<Partial<Med>, 'schedule'> & { schedule?: Partial<MedSchedule> };

function med(overrides: MedOverrides = {}): Med {
  const { schedule, ...rest } = overrides;
  return {
    name: 'Naproxen',
    doseText: '500 mg',
    form: 'tablet',
    purpose: '',
    prescriber: '',
    schedule: {
      kind: 'times',
      times: ['08:00', '20:00'],
      everyHours: null,
      startOn: '2026-08-01',
      endOn: null,
      taper: [],
      ...schedule,
    },
    active: true,
    notes: '',
    refills: null,
    noDriving: false,
    variableDose: false,
    fillQuantity: null,
    filledOn: null,
    ...rest,
  };
}

function rec(overrides: Partial<DoseRecord> = {}): DoseRecord {
  return {
    medId: 'm1',
    plannedAt: '08:00',
    takenAt: null,
    units: 1,
    status: 'taken',
    backfilled: false,
    by: 'u1',
    note: '',
    ...overrides,
  };
}

const NOON = new Date(2026, 7, 6, 12, 0).getTime(); // Aug 6 2026, 12:00 local

describe('scheduledDoseId', () => {
  it('is deterministic and colon-free', () => {
    expect(scheduledDoseId('abc', '08:00')).toBe('abc_0800');
  });
});

describe('slotEpoch', () => {
  it('lands on the local wall-clock time', () => {
    const d = new Date(slotEpoch('2026-08-06', '08:30'));
    expect(d.getHours()).toBe(8);
    expect(d.getMinutes()).toBe(30);
    expect(d.getDate()).toBe(6);
  });

  it('preserves wall-clock across DST days', () => {
    // 2026-03-08 is the US spring-forward date; in DST-free zones it's a
    // plain day. Either way, the 8 AM slot must read 8 AM locally.
    const d = new Date(slotEpoch('2026-03-08', '08:00'));
    expect(d.getHours()).toBe(8);
  });
});

describe('medWindowContains', () => {
  it('bounds by startOn and endOn inclusively', () => {
    const m = med({ schedule: { startOn: '2026-08-01', endOn: '2026-08-10' } });
    expect(medWindowContains(m, '2026-07-31')).toBe(false);
    expect(medWindowContains(m, '2026-08-01')).toBe(true);
    expect(medWindowContains(m, '2026-08-10')).toBe(true);
    expect(medWindowContains(m, '2026-08-11')).toBe(false);
  });

  it('treats empty startOn and null endOn as open', () => {
    const m = med({ schedule: { startOn: '', endOn: null } });
    expect(medWindowContains(m, '1999-01-01')).toBe(true);
  });
});

describe('doseTextForDate (taper)', () => {
  const tapered = med({
    doseText: '40 mg',
    schedule: {
      taper: [
        { from: '2026-08-10', to: '2026-08-19', doseText: '20 mg' },
        { from: '2026-08-20', to: null, doseText: '10 mg' },
      ],
    },
  });

  it('uses the base dose before the taper starts', () => {
    expect(doseTextForDate(tapered, '2026-08-09')).toBe('40 mg');
  });

  it('applies steps on their inclusive boundaries', () => {
    expect(doseTextForDate(tapered, '2026-08-10')).toBe('20 mg');
    expect(doseTextForDate(tapered, '2026-08-19')).toBe('20 mg');
    expect(doseTextForDate(tapered, '2026-08-20')).toBe('10 mg');
  });

  it('open-ended steps apply indefinitely', () => {
    expect(doseTextForDate(tapered, '2027-01-01')).toBe('10 mg');
  });

  it('last matching step wins on overlap', () => {
    const overlapping = med({
      doseText: '40 mg',
      schedule: {
        taper: [
          { from: '2026-08-10', to: null, doseText: '20 mg' },
          { from: '2026-08-15', to: null, doseText: '10 mg' },
        ],
      },
    });
    expect(doseTextForDate(overlapping, '2026-08-12')).toBe('20 mg');
    expect(doseTextForDate(overlapping, '2026-08-16')).toBe('10 mg');
  });
});

describe('plannedSlotsFor', () => {
  it('returns times inside the window, [] outside', () => {
    const m = med();
    expect(plannedSlotsFor(m, '2026-08-06')).toEqual(['08:00', '20:00']);
    expect(plannedSlotsFor(m, '2026-07-31')).toEqual([]);
  });

  it('returns [] for interval and prn schedules', () => {
    expect(plannedSlotsFor(med({ schedule: { kind: 'prn' } }), '2026-08-06')).toEqual([]);
    expect(
      plannedSlotsFor(med({ schedule: { kind: 'interval', everyHours: 6 } }), '2026-08-06'),
    ).toEqual([]);
  });

  it('ignores the active flag (archived meds keep their history)', () => {
    expect(plannedSlotsFor(med({ active: false }), '2026-08-06')).toEqual(['08:00', '20:00']);
  });
});

describe('materializeDay', () => {
  const meds = { m1: med() };

  it('marks unlogged past slots overdue and future slots pending', () => {
    const views = materializeDay(meds, {}, '2026-08-06', NOON);
    expect(views).toHaveLength(2);
    expect(views[0]).toMatchObject({ slot: '08:00', status: 'overdue', scheduled: true });
    expect(views[1]).toMatchObject({ slot: '20:00', status: 'pending' });
  });

  it('everything on a fully past day with no records is overdue', () => {
    const views = materializeDay(meds, {}, '2026-08-05', NOON);
    expect(views.map((v) => v.status)).toEqual(['overdue', 'overdue']);
  });

  it('merges stored records onto their slots', () => {
    const takenAt = slotEpoch('2026-08-06', '08:10');
    const views = materializeDay(
      meds,
      { m1_0800: rec({ takenAt }) },
      '2026-08-06',
      NOON,
    );
    expect(views[0]).toMatchObject({ status: 'taken', takenAt, late: false });
  });

  it('flags late when taken over an hour after the slot', () => {
    const takenAt = slotEpoch('2026-08-06', '08:00') + LATE_THRESHOLD_MS + 60_000;
    const views = materializeDay(meds, { m1_0800: rec({ takenAt }) }, '2026-08-06', NOON);
    expect(views[0].late).toBe(true);
  });

  it('includes PRN records as unscheduled rows sorted by time', () => {
    const takenAt = slotEpoch('2026-08-06', '12:30');
    const views = materializeDay(
      meds,
      { prn_x: rec({ medId: 'm2', plannedAt: null, takenAt }) },
      '2026-08-06',
      NOON,
    );
    expect(views).toHaveLength(3);
    expect(views[1]).toMatchObject({ doseId: 'prn_x', scheduled: false, status: 'taken' });
  });

  it('keeps records from an older schedule as unscheduled rows', () => {
    // Slot moved from 09:00 to 08:00; the old record still shows.
    const views = materializeDay(
      meds,
      { m1_0900: rec({ plannedAt: '09:00' }) },
      '2026-08-06',
      NOON,
    );
    expect(views.find((v) => v.doseId === 'm1_0900')).toMatchObject({
      scheduled: false,
      slot: '09:00',
    });
  });

  it('resolves taper dose text per date', () => {
    const tapered = {
      m1: med({
        doseText: '40 mg',
        schedule: { taper: [{ from: '2026-08-06', to: null, doseText: '20 mg' }] },
      }),
    };
    const views = materializeDay(tapered, {}, '2026-08-06', NOON);
    expect(views[0].doseText).toBe('20 mg');
  });
});

describe('interval meds', () => {
  const ivMed = med({ schedule: { kind: 'interval', everyHours: 6, times: [] } });

  it('finds the latest takenAt across days', () => {
    const doses = {
      '2026-08-05': { prn_a: rec({ medId: 'iv', takenAt: 100 }) },
      '2026-08-06': {
        prn_b: rec({ medId: 'iv', takenAt: 300 }),
        prn_c: rec({ medId: 'other', takenAt: 999 }),
      },
    };
    expect(lastTakenAtForMed(doses, 'iv')).toBe(300);
    expect(lastTakenAtForMed(doses, 'missing')).toBeNull();
  });

  it('is due now when never taken', () => {
    expect(intervalNextDue(ivMed, null, NOON)).toEqual({ dueAt: null, dueNow: true });
  });

  it('anchors the next due time to the last dose', () => {
    const last = NOON - 5 * 3_600_000;
    const { dueAt, dueNow } = intervalNextDue(ivMed, last, NOON);
    expect(dueAt).toBe(last + 6 * 3_600_000);
    expect(dueNow).toBe(false);
    expect(intervalNextDue(ivMed, NOON - 7 * 3_600_000, NOON).dueNow).toBe(true);
  });

  it('is inert outside the schedule window or for other kinds', () => {
    const ended = med({
      schedule: { kind: 'interval', everyHours: 6, endOn: '2026-08-01' },
    });
    expect(intervalNextDue(ended, null, NOON).dueNow).toBe(false);
    expect(intervalNextDue(med(), null, NOON).dueNow).toBe(false);
  });
});

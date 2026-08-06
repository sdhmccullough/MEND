import { describe, expect, it } from 'vitest';
import {
  currentStreak,
  dayAdherence,
  dayDotColor,
  rangeAdherence,
} from '../src/lib/adherence';
import { scheduledDoseId, slotEpoch } from '../src/lib/doses';
import type { DoseRecord, Med, MedSchedule } from '../src/lib/schema';

type MedOverrides = Omit<Partial<Med>, 'schedule'> & { schedule?: Partial<MedSchedule> };

function med(overrides: MedOverrides = {}): Med {
  const { schedule, ...rest } = overrides;
  return {
    name: 'Med',
    doseText: '1 tab',
    form: '',
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

function taken(medId: string, slot: string, backfilled = false): DoseRecord {
  return {
    medId,
    plannedAt: slot,
    takenAt: backfilled ? null : 1,
    units: 1,
    status: 'taken',
    backfilled,
    by: 'u1',
    note: '',
  };
}

function skipped(medId: string, slot: string, backfilled = false): DoseRecord {
  return { ...taken(medId, slot, backfilled), takenAt: null, status: 'skipped' };
}

function day(medId: string, records: Record<string, DoseRecord>) {
  void medId;
  return records;
}

const MEDS = { m1: med() };
const NOON = new Date(2026, 7, 6, 12, 0).getTime();
const NIGHT = new Date(2026, 7, 6, 23, 0).getTime();

describe('dayAdherence', () => {
  it('counts due vs expected on a partial day', () => {
    const a = dayAdherence(MEDS, {}, '2026-08-06', NOON);
    expect(a.expected).toBe(2);
    expect(a.due).toBe(1); // only the 08:00 slot has passed by noon
    expect(a.missed).toBe(1);
  });

  it('past days are fully due', () => {
    const a = dayAdherence(MEDS, {}, '2026-08-05', NOON);
    expect(a.due).toBe(2);
    expect(a.missed).toBe(2);
  });

  it('classifies taken vs skipped', () => {
    const recs = day('m1', {
      [scheduledDoseId('m1', '08:00')]: taken('m1', '08:00'),
      [scheduledDoseId('m1', '20:00')]: skipped('m1', '20:00'),
    });
    const a = dayAdherence(MEDS, recs, '2026-08-05', NOON);
    expect(a).toMatchObject({ taken: 1, skipped: 1, missed: 0 });
  });

  it('PRN records never count toward adherence', () => {
    const prnMeds = { p1: med({ schedule: { kind: 'prn', times: [] } }) };
    const recs = { prn_x: taken('p1', '08:00') };
    const a = dayAdherence(prnMeds, recs, '2026-08-05', NOON);
    expect(a.expected).toBe(0);
  });

  it('detects all-backfilled days', () => {
    const recs = {
      [scheduledDoseId('m1', '08:00')]: taken('m1', '08:00', true),
      [scheduledDoseId('m1', '20:00')]: taken('m1', '20:00', true),
    };
    expect(dayAdherence(MEDS, recs, '2026-08-05', NOON).allBackfilled).toBe(true);
    const mixed = { ...recs, [scheduledDoseId('m1', '08:00')]: taken('m1', '08:00') };
    expect(dayAdherence(MEDS, mixed, '2026-08-05', NOON).allBackfilled).toBe(false);
  });
});

describe('dayDotColor truth table', () => {
  const at = (records: Record<string, DoseRecord>, dateKey: string, now: number) =>
    dayDotColor(dayAdherence(MEDS, records, dateKey, now));

  it('none: nothing scheduled or nothing due yet', () => {
    expect(dayDotColor(dayAdherence({}, {}, '2026-08-05', NOON))).toBe('none');
    const morning = slotEpoch('2026-08-06', '07:00');
    expect(at({}, '2026-08-06', morning)).toBe('none');
  });

  it('green: everything due taken', () => {
    const recs = {
      [scheduledDoseId('m1', '08:00')]: taken('m1', '08:00'),
      [scheduledDoseId('m1', '20:00')]: taken('m1', '20:00'),
    };
    expect(at(recs, '2026-08-05', NOON)).toBe('green');
    // Mid-day: morning taken, evening not yet due → still green.
    expect(at({ [scheduledDoseId('m1', '08:00')]: taken('m1', '08:00') }, '2026-08-06', NOON)).toBe(
      'green',
    );
  });

  it('red: nothing taken', () => {
    expect(at({}, '2026-08-05', NOON)).toBe('red');
    expect(at({ [scheduledDoseId('m1', '08:00')]: skipped('m1', '08:00') }, '2026-08-06', NIGHT)).toBe(
      'red',
    );
  });

  it('amber: partial', () => {
    expect(at({ [scheduledDoseId('m1', '08:00')]: taken('m1', '08:00') }, '2026-08-05', NOON)).toBe(
      'amber',
    );
  });

  it('hollow: reconstructed (all records backfilled)', () => {
    expect(
      at({ [scheduledDoseId('m1', '08:00')]: taken('m1', '08:00', true) }, '2026-08-05', NOON),
    ).toBe('hollow');
  });
});

describe('rangeAdherence', () => {
  it('sums due and taken across days', () => {
    const doses = {
      '2026-08-04': { [scheduledDoseId('m1', '08:00')]: taken('m1', '08:00') },
      '2026-08-05': {
        [scheduledDoseId('m1', '08:00')]: taken('m1', '08:00'),
        [scheduledDoseId('m1', '20:00')]: taken('m1', '20:00'),
      },
    };
    const r = rangeAdherence(MEDS, doses, '2026-08-04', '2026-08-05', NOON);
    expect(r.due).toBe(4);
    expect(r.taken).toBe(3);
    expect(r.pct).toBe(75);
  });

  it('pct is null when nothing was due', () => {
    const r = rangeAdherence(MEDS, {}, '2026-07-01', '2026-07-05', NOON);
    expect(r.pct).toBeNull();
  });
});

describe('currentStreak', () => {
  const fullDay = (_dk: string, backfilled = false) => ({
    [scheduledDoseId('m1', '08:00')]: taken('m1', '08:00', backfilled),
    [scheduledDoseId('m1', '20:00')]: taken('m1', '20:00', backfilled),
  });

  it('counts consecutive fully-taken days, today included when clean', () => {
    const doses = {
      '2026-08-04': fullDay('2026-08-04'),
      '2026-08-05': fullDay('2026-08-05'),
      '2026-08-06': { [scheduledDoseId('m1', '08:00')]: taken('m1', '08:00') },
    };
    // Noon: today's due slot is taken → today counts.
    expect(currentStreak(MEDS, doses, NOON)).toBe(3);
  });

  it('a miss today zeroes the streak', () => {
    const doses = { '2026-08-05': fullDay('2026-08-05') };
    expect(currentStreak(MEDS, doses, NOON)).toBe(0); // 08:00 today missed
  });

  it('breaks on the first bad past day and counts backfilled days', () => {
    const doses = {
      '2026-08-03': fullDay('2026-08-03', true),
      '2026-08-04': fullDay('2026-08-04'),
      // 2026-08-05 missing entirely → break
      '2026-08-06': fullDay('2026-08-06'),
    };
    expect(currentStreak(MEDS, doses, NIGHT)).toBe(1);
  });

  it('days before the schedule started are neutral', () => {
    const startMeds = { m1: med({ schedule: { startOn: '2026-08-05' } }) };
    const doses = {
      '2026-08-05': fullDay('2026-08-05'),
      '2026-08-06': fullDay('2026-08-06'),
    };
    // Walks past 08-04 and earlier (nothing scheduled) without breaking.
    expect(currentStreak(startMeds, doses, NIGHT)).toBe(2);
  });
});

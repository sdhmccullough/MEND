import { describe, expect, it } from 'vitest';
import { lastNarcoticDose, medSupply, unitsUsed } from '../src/lib/supply';
import type { DoseRecord, Med, MedSchedule } from '../src/lib/schema';

type MedOverrides = Omit<Partial<Med>, 'schedule'> & { schedule?: Partial<MedSchedule> };

function med(overrides: MedOverrides = {}): Med {
  const { schedule, ...rest } = overrides;
  return {
    name: 'Oxycodone',
    doseText: '5 mg',
    form: 'tablet',
    purpose: '',
    prescriber: '',
    schedule: {
      kind: 'prn',
      times: [],
      everyHours: null,
      startOn: '2026-08-05',
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

function dose(overrides: Partial<DoseRecord> = {}): DoseRecord {
  return {
    medId: 'oxy',
    plannedAt: null,
    takenAt: new Date(2026, 7, 5, 20, 0).getTime(),
    units: 1,
    status: 'taken',
    backfilled: false,
    by: 'u1',
    note: '',
    ...overrides,
  };
}

const NOW = new Date(2026, 7, 7, 12, 0).getTime(); // Aug 7

describe('unitsUsed', () => {
  const doses = {
    '2026-08-04': { a: dose({ units: 5 }) }, // before the fill — ignored
    '2026-08-05': { b: dose({ units: 2 }) },
    '2026-08-06': { c: dose({ units: 1 }), d: dose({ status: 'skipped', units: 1 }) },
  };

  it('counts units on or after the fill date, ignoring skips', () => {
    expect(unitsUsed(doses, 'oxy', '2026-08-05')).toBe(3);
  });

  it('ignores other meds', () => {
    expect(unitsUsed(doses, 'other', '2026-08-05')).toBe(0);
  });
});

describe('medSupply', () => {
  it('returns null without fill data', () => {
    expect(medSupply(med(), 'oxy', {}, NOW)).toBeNull();
  });

  it('counts remaining tablets for a PRN med', () => {
    const m = med({ fillQuantity: 20, filledOn: '2026-08-05' });
    const doses = { '2026-08-05': { a: dose({ units: 2 }) }, '2026-08-06': { b: dose() } };
    const s = medSupply(m, 'oxy', doses, NOW)!;
    expect(s.used).toBe(3);
    expect(s.remaining).toBe(17);
  });

  it('projects scheduled meds off the daily slot count', () => {
    const m = med({
      fillQuantity: 60,
      filledOn: '2026-08-06',
      schedule: { kind: 'times', times: ['08:00', '20:00'] },
    });
    const s = medSupply(m, 'oxy', { '2026-08-06': { a: dose({ units: 2 }) } }, NOW)!;
    expect(s.perDay).toBe(2);
    expect(s.remaining).toBe(58);
    expect(s.daysLeft).toBe(29);
    expect(s.low).toBe(false);
  });

  it('flags low supply', () => {
    const m = med({
      fillQuantity: 8,
      filledOn: '2026-08-06',
      schedule: { kind: 'times', times: ['08:00', '20:00'] },
    });
    expect(medSupply(m, 'oxy', {}, NOW)!.low).toBe(true);
  });

  it('never goes negative', () => {
    const m = med({ fillQuantity: 1, filledOn: '2026-08-05' });
    const doses = { '2026-08-06': { a: dose({ units: 5 }) } };
    expect(medSupply(m, 'oxy', doses, NOW)!.remaining).toBe(0);
  });
});

describe('lastNarcoticDose', () => {
  const meds = {
    oxy: med({ noDriving: true }),
    cele: med({ name: 'Celecoxib' }), // not flagged
  };

  it('finds the most recent flagged dose', () => {
    const early = new Date(2026, 7, 6, 8, 0).getTime();
    const late = new Date(2026, 7, 7, 10, 0).getTime();
    const doses = {
      '2026-08-06': { a: dose({ takenAt: early }) },
      '2026-08-07': {
        b: dose({ takenAt: late }),
        c: dose({ medId: 'cele', takenAt: NOW }), // not a narcotic
      },
    };
    const status = lastNarcoticDose(meds, doses, NOW)!;
    expect(status.medName).toBe('Oxycodone');
    expect(status.lastAt).toBe(late);
    expect(status.minutesSince).toBe(120);
  });

  it('ignores skipped doses and returns null when none', () => {
    expect(
      lastNarcoticDose(meds, { '2026-08-07': { a: dose({ status: 'skipped' }) } }, NOW),
    ).toBeNull();
    expect(lastNarcoticDose(meds, {}, NOW)).toBeNull();
  });
});

import { describe, expect, it } from 'vitest';
import { lastTakenAt, rulesForMed, spacingConflicts } from '../src/lib/spacing';
import type { DoseRecord, Med, MedSchedule, SpacingRule } from '../src/lib/schema';

type MedOverrides = Omit<Partial<Med>, 'schedule'> & { schedule?: Partial<MedSchedule> };

function med(name: string, overrides: MedOverrides = {}): Med {
  const { schedule, ...rest } = overrides;
  return {
    name,
    doseText: '',
    form: '',
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

function dose(medId: string, takenAt: number | null, status: DoseRecord['status'] = 'taken'): DoseRecord {
  return {
    medId,
    plannedAt: null,
    takenAt,
    units: 1,
    status,
    backfilled: false,
    by: 'u1',
    note: '',
  };
}

const MEDS = { oxy: med('Oxycodone'), preg: med('Pregabalin'), cele: med('Celecoxib') };
const RULES: Record<string, SpacingRule> = {
  r1: { medA: 'oxy', medB: 'preg', hours: 2, note: 'Per care team.' },
};
const NOW = new Date(2026, 7, 7, 12, 0).getTime();
const minutesAgo = (n: number) => NOW - n * 60_000;

describe('lastTakenAt', () => {
  it('finds the latest taken dose across days, ignoring skips', () => {
    const doses = {
      '2026-08-06': { a: dose('preg', minutesAgo(900)) },
      '2026-08-07': {
        b: dose('preg', minutesAgo(30)),
        c: dose('preg', minutesAgo(10), 'skipped'),
      },
    };
    expect(lastTakenAt(doses, 'preg')).toBe(minutesAgo(30));
    expect(lastTakenAt(doses, 'oxy')).toBeNull();
  });
});

describe('spacingConflicts', () => {
  it('flags a dose taken inside the window, with time remaining', () => {
    const doses = { '2026-08-07': { a: dose('preg', minutesAgo(45)) } };
    const [c] = spacingConflicts('oxy', RULES, MEDS, doses, NOW);
    expect(c.otherMedName).toBe('Pregabalin');
    expect(c.hours).toBe(2);
    expect(c.minutesRemaining).toBe(75);
    expect(c.clearAt).toBe(minutesAgo(45) + 2 * 3_600_000);
  });

  it('is clear once the window has passed', () => {
    const doses = { '2026-08-07': { a: dose('preg', minutesAgo(121)) } };
    expect(spacingConflicts('oxy', RULES, MEDS, doses, NOW)).toEqual([]);
  });

  it('applies in both directions', () => {
    const doses = { '2026-08-07': { a: dose('oxy', minutesAgo(30)) } };
    expect(spacingConflicts('preg', RULES, MEDS, doses, NOW)).toHaveLength(1);
  });

  it('ignores meds the rule does not name', () => {
    const doses = { '2026-08-07': { a: dose('preg', minutesAgo(10)) } };
    expect(spacingConflicts('cele', RULES, MEDS, doses, NOW)).toEqual([]);
  });

  it('is silent when the paired med was never taken', () => {
    expect(spacingConflicts('oxy', RULES, MEDS, {}, NOW)).toEqual([]);
  });

  it('skipped doses do not start the clock', () => {
    const doses = { '2026-08-07': { a: dose('preg', minutesAgo(10), 'skipped') } };
    expect(spacingConflicts('oxy', RULES, MEDS, doses, NOW)).toEqual([]);
  });

  it('ignores malformed rules with no hours', () => {
    const bad = { r: { medA: 'oxy', medB: 'preg', hours: 0, note: '' } };
    const doses = { '2026-08-07': { a: dose('preg', minutesAgo(5)) } };
    expect(spacingConflicts('oxy', bad, MEDS, doses, NOW)).toEqual([]);
  });

  it('reports multiple conflicts, soonest-clearing last', () => {
    const rules: Record<string, SpacingRule> = {
      ...RULES,
      r2: { medA: 'oxy', medB: 'cele', hours: 4, note: '' },
    };
    const doses = {
      '2026-08-07': { a: dose('preg', minutesAgo(60)), b: dose('cele', minutesAgo(30)) },
    };
    const list = spacingConflicts('oxy', rules, MEDS, doses, NOW);
    expect(list.map((c) => c.otherMedName)).toEqual(['Celecoxib', 'Pregabalin']);
  });
});

describe('rulesForMed', () => {
  it('lists rules touching a med from either side', () => {
    expect(rulesForMed('oxy', RULES, MEDS)).toEqual([
      { otherMedName: 'Pregabalin', hours: 2, note: 'Per care team.' },
    ]);
    expect(rulesForMed('preg', RULES, MEDS)[0].otherMedName).toBe('Oxycodone');
    expect(rulesForMed('cele', RULES, MEDS)).toEqual([]);
  });
});

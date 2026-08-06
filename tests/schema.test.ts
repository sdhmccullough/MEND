import { describe, expect, it } from 'vitest';
import {
  DEFAULT_GCAL,
  normalizeAppointment,
  normalizeDose,
  normalizeDoses,
  normalizeGuideSection,
  normalizeInboxItem,
  normalizeInjury,
  normalizeMed,
  normalizeMetric,
  normalizePtSession,
  normalizeSettings,
} from '../src/lib/schema';

// Normalizers must be TOTAL: garbage in, safe defaults out — never throw.
// RTDB snapshots can be null, partial, arrays-as-objects, or foreign shapes
// written by an older app version.

const GARBAGE: unknown[] = [null, undefined, 42, 'nope', [], { random: true }];

describe('normalizers are total', () => {
  it.each([
    ['normalizeInjury', normalizeInjury],
    ['normalizeMed', normalizeMed],
    ['normalizeDose', normalizeDose],
    ['normalizePtSession', normalizePtSession],
    ['normalizeMetric', normalizeMetric],
    ['normalizeAppointment', normalizeAppointment],
    ['normalizeInboxItem', normalizeInboxItem],
    ['normalizeGuideSection', normalizeGuideSection],
    ['normalizeSettings', normalizeSettings],
  ])('%s never throws on garbage', (_name, fn) => {
    for (const g of GARBAGE) expect(() => fn(g)).not.toThrow();
  });
});

describe('normalizeMed', () => {
  it('clamps schedule kind to the enum', () => {
    const med = normalizeMed({ schedule: { kind: 'hourly' } });
    expect(med.schedule.kind).toBe('times');
    expect(normalizeMed({ schedule: { kind: 'prn' } }).schedule.kind).toBe('prn');
  });

  it('filters malformed times and sorts them', () => {
    const med = normalizeMed({
      schedule: { kind: 'times', times: ['20:00', 'bogus', '08:00', 7] },
    });
    expect(med.schedule.times).toEqual(['08:00', '20:00']);
  });

  it('accepts RTDB array-as-object times', () => {
    const med = normalizeMed({
      schedule: { kind: 'times', times: { 0: '08:00', 1: '20:00' } },
    });
    expect(med.schedule.times).toEqual(['08:00', '20:00']);
  });

  it('rejects non-positive everyHours', () => {
    expect(normalizeMed({ schedule: { everyHours: 0 } }).schedule.everyHours).toBeNull();
    expect(normalizeMed({ schedule: { everyHours: 6 } }).schedule.everyHours).toBe(6);
  });

  it('defaults active to true and coerces taper steps', () => {
    const med = normalizeMed({
      schedule: { taper: [{ from: '2026-08-10', doseText: '250 mg' }] },
    });
    expect(med.active).toBe(true);
    expect(med.schedule.taper).toEqual([
      { from: '2026-08-10', to: null, doseText: '250 mg' },
    ]);
  });
});

describe('normalizeDose', () => {
  it('clamps unknown status to pending', () => {
    expect(normalizeDose({ status: 'devoured' }).status).toBe('pending');
    expect(normalizeDose({ status: 'skipped' }).status).toBe('skipped');
  });

  it('only accepts literal true for backfilled', () => {
    expect(normalizeDose({ backfilled: 'yes' }).backfilled).toBe(false);
    expect(normalizeDose({ backfilled: true }).backfilled).toBe(true);
  });

  it('normalizes the nested doses tree', () => {
    const doses = normalizeDoses({
      '2026-08-05': { med1_0800: { medId: 'med1', status: 'taken' } },
      garbageDay: 'not-an-object',
    });
    expect(doses['2026-08-05']['med1_0800'].status).toBe('taken');
    expect(doses['garbageDay']).toEqual({});
  });
});

describe('normalizeMetric', () => {
  it('clamps pain to 0–10 and rounds', () => {
    expect(normalizeMetric({ pain: 14 }).pain).toBe(10);
    expect(normalizeMetric({ pain: -3 }).pain).toBe(0);
    expect(normalizeMetric({ pain: 6.6 }).pain).toBe(7);
  });

  it('treats missing/garbage pain as null (not zero)', () => {
    expect(normalizeMetric({}).pain).toBeNull();
    expect(normalizeMetric({ pain: 'ow' }).pain).toBeNull();
  });
});

describe('normalizeAppointment', () => {
  it('clamps kind and source to their enums', () => {
    const a = normalizeAppointment({ kind: 'dentist', source: 'outlook' });
    expect(a.kind).toBe('other');
    expect(a.source).toBe('manual');
    expect(normalizeAppointment({ kind: 'pt', source: 'gcal' }).kind).toBe('pt');
  });
});

describe('normalizeInboxItem', () => {
  it('clamps status to pending and preserves payload verbatim', () => {
    const item = normalizeInboxItem({
      type: 'doseLog',
      status: 'exploded',
      payload: { anything: [1, 2, 3] },
    });
    expect(item.status).toBe('pending');
    expect(item.type).toBe('doseLog');
    expect(item.payload).toEqual({ anything: [1, 2, 3] });
  });
});

describe('normalizeSettings', () => {
  it('falls back to default keywords when none stored', () => {
    expect(normalizeSettings(null).gcal.keywords).toEqual(DEFAULT_GCAL.keywords);
  });

  it('keeps stored keywords when present', () => {
    const s = normalizeSettings({ gcal: { keywords: ['ortho'] } });
    expect(s.gcal.keywords).toEqual(['ortho']);
  });
});

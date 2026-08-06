import { describe, expect, it } from 'vitest';
import {
  buildPainSeries,
  buildRomSeries,
  buildWeekBuckets,
  daysSinceInjury,
  weekStartOf,
} from '../src/lib/progress';
import type { DayMetric, PtSession } from '../src/lib/schema';

function session(overrides: Partial<PtSession> = {}): PtSession {
  return {
    at: new Date(2026, 7, 4, 15, 0).getTime(),
    kind: 'clinic',
    exercises: [],
    painPre: 5,
    painPost: 3,
    rom: {},
    therapistNotes: '',
    source: 'manual',
    by: 'u1',
    ...overrides,
  };
}

function metric(pain: number | null, rom: Record<string, number> = {}): DayMetric {
  return { pain, sane: null, rom, notes: '', by: 'u1' };
}

const NOW = new Date(2026, 7, 6, 12, 0).getTime();

describe('buildPainSeries', () => {
  it('lines up daily pain with PT pre/post overlays', () => {
    const series = buildPainSeries(
      { '2026-08-03': metric(6), '2026-08-04': metric(5), '2026-08-05': metric(4) },
      { s1: session() }, // Aug 4
      '2026-08-03',
      '2026-08-05',
    );
    expect(series).toHaveLength(3);
    expect(series[0]).toMatchObject({ pain: 6, ptPre: null, ptPost: null });
    expect(series[1]).toMatchObject({ pain: 5, ptPre: 5, ptPost: 3 });
    expect(series[2]).toMatchObject({ pain: 4, ptPre: null });
  });

  it('fills unlogged days with nulls (chart connects across them)', () => {
    const series = buildPainSeries({}, {}, '2026-08-03', '2026-08-04');
    expect(series.every((p) => p.pain === null)).toBe(true);
  });
});

describe('buildRomSeries', () => {
  it('merges metrics and session ROM, most-measured joints first', () => {
    const series = buildRomSeries(
      {
        '2026-08-01': metric(null, { 'knee flexion': 95 }),
        '2026-08-03': metric(null, { 'knee flexion': 100, 'knee extension': -5 }),
      },
      { s1: session({ rom: { 'knee flexion': 105 } }) }, // Aug 4
    );
    expect(series[0].joint).toBe('knee flexion');
    expect(series[0].points.map((p) => p.degrees)).toEqual([95, 100, 105]);
    expect(series[1].joint).toBe('knee extension');
  });

  it('caps the number of joints', () => {
    const rom: Record<string, number> = { a: 1, b: 2, c: 3, d: 4, e: 5 };
    const series = buildRomSeries({ '2026-08-01': metric(null, rom) }, {}, 3);
    expect(series).toHaveLength(3);
  });
});

describe('weekStartOf / buildWeekBuckets', () => {
  it('anchors weeks on Sunday', () => {
    expect(weekStartOf('2026-08-06')).toBe('2026-08-02'); // Thu → prior Sun
    expect(weekStartOf('2026-08-02')).toBe('2026-08-02'); // Sun → itself
  });

  it('counts sessions into the right week buckets, oldest first', () => {
    const sessions = {
      s1: session(), // Aug 4 → week of Aug 2
      s2: session({ at: new Date(2026, 6, 28, 9, 0).getTime() }), // Jul 28 → week of Jul 26
      s3: session({ at: new Date(2026, 6, 29, 9, 0).getTime() }), // Jul 29 → week of Jul 26
    };
    const buckets = buildWeekBuckets(sessions, {}, {}, 2, NOW);
    expect(buckets.map((b) => b.weekStart)).toEqual(['2026-07-26', '2026-08-02']);
    expect(buckets[0].sessions).toBe(2);
    expect(buckets[1].sessions).toBe(1);
    expect(buckets[0].adherencePct).toBeNull(); // no meds scheduled
  });
});

describe('daysSinceInjury', () => {
  it('counts whole days from the injury date', () => {
    expect(daysSinceInjury('2026-07-16', NOW)).toBe(21);
    expect(daysSinceInjury('', NOW)).toBeNull();
  });
});

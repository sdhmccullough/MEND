import { describe, expect, it } from 'vitest';
import {
  addDays,
  dateKeyRange,
  epochToDateKey,
  formatHHMM12,
  minutesBetween,
  monthGrid,
  parseDateKey,
  toLocalDateKey,
} from '../src/lib/dates';

// These tests are timezone-sensitive by design: run them under multiple TZ
// values (e.g. TZ=Asia/Tokyo, TZ=America/Denver) to lock in the local-date
// guarantee that fixed PayDay's v1 cross-timezone week-wipe bug.

describe('toLocalDateKey', () => {
  it('uses the local calendar date, not UTC', () => {
    // 00:30 local on Jan 1 — in UTC+ zones the UTC date is Dec 31.
    const d = new Date(2026, 0, 1, 0, 30);
    expect(toLocalDateKey(d)).toBe('2026-01-01');
  });

  it('round-trips through parseDateKey', () => {
    const key = '2026-08-05';
    expect(toLocalDateKey(parseDateKey(key))).toBe(key);
  });

  it('pads months and days', () => {
    expect(toLocalDateKey(new Date(2026, 2, 5))).toBe('2026-03-05');
  });
});

describe('addDays', () => {
  it('crosses month boundaries', () => {
    expect(addDays('2026-08-31', 1)).toBe('2026-09-01');
    expect(addDays('2026-08-01', -1)).toBe('2026-07-31');
  });

  it('crosses year boundaries', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
  });

  it('handles leap February', () => {
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDays('2028-02-29', 1)).toBe('2028-03-01');
  });

  it('crosses DST transitions without skipping a date', () => {
    // US spring-forward 2026-03-08 and fall-back 2026-11-01.
    expect(addDays('2026-03-07', 1)).toBe('2026-03-08');
    expect(addDays('2026-03-08', 1)).toBe('2026-03-09');
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(addDays('2026-11-01', 1)).toBe('2026-11-02');
  });
});

describe('dateKeyRange', () => {
  it('is inclusive on both ends', () => {
    expect(dateKeyRange('2026-08-05', '2026-08-07')).toEqual([
      '2026-08-05',
      '2026-08-06',
      '2026-08-07',
    ]);
  });

  it('returns a single day when from === to', () => {
    expect(dateKeyRange('2026-08-05', '2026-08-05')).toEqual(['2026-08-05']);
  });

  it('returns [] for an inverted range', () => {
    expect(dateKeyRange('2026-08-07', '2026-08-05')).toEqual([]);
  });
});

describe('monthGrid', () => {
  it('always yields 42 cells starting on a Sunday', () => {
    const cells = monthGrid(2026, 7); // Aug 2026; Aug 1 is a Saturday
    expect(cells).toHaveLength(42);
    expect(parseDateKey(cells[0].dateKey).getDay()).toBe(0);
  });

  it('marks in-month vs padding cells', () => {
    const cells = monthGrid(2026, 7); // Aug 2026 starts Sat → 6 pad days
    expect(cells[5].inMonth).toBe(false); // Fri Jul 31
    expect(cells[6].inMonth).toBe(true); // Sat Aug 1
    expect(cells.filter((c) => c.inMonth)).toHaveLength(31);
  });

  it('handles leap-year February', () => {
    const cells = monthGrid(2028, 1);
    expect(cells.filter((c) => c.inMonth)).toHaveLength(29);
  });

  it('handles a month starting on Sunday with zero padding', () => {
    const cells = monthGrid(2026, 10); // Nov 2026 starts on a Sunday
    expect(cells[0].dateKey).toBe('2026-11-01');
    expect(cells[0].inMonth).toBe(true);
  });
});

describe('time formatting', () => {
  it('formats HH:MM as 12-hour', () => {
    expect(formatHHMM12('00:05')).toBe('12:05 AM');
    expect(formatHHMM12('08:00')).toBe('8:00 AM');
    expect(formatHHMM12('12:00')).toBe('12:00 PM');
    expect(formatHHMM12('20:30')).toBe('8:30 PM');
    expect(formatHHMM12('')).toBe('');
  });

  it('computes minutes between times, clamping negatives', () => {
    expect(minutesBetween('08:00', '09:30')).toBe(90);
    expect(minutesBetween('09:30', '08:00')).toBe(0);
    expect(minutesBetween('', '09:00')).toBe(0);
  });

  it('epochToDateKey uses the local date', () => {
    const noon = new Date(2026, 7, 5, 12, 0).getTime();
    expect(epochToDateKey(noon)).toBe('2026-08-05');
  });
});

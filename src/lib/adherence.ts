// Adherence math. One implementation feeds the Today checklist summary,
// the calendar dots, streaks, and the Progress charts — so it lives here,
// pure and tested, not scattered across screens.
//
// Only SCHEDULED slots ('times'-kind meds) count toward adherence. PRN and
// interval doses are logged events with no denominator — they never count
// for or against.

import type { DoseRecord, Med } from './schema';
import { addDays, dateKeyRange, toLocalDateKey } from './dates';
import { plannedSlotsFor, scheduledDoseId, slotEpoch } from './doses';

export interface DayAdherence {
  /** Scheduled slots on this date (whole day, regardless of time). */
  expected: number;
  /** Slots whose time has passed (== expected for past days). */
  due: number;
  taken: number;
  skipped: number;
  /** Due slots with no record. */
  missed: number;
  anyRecords: boolean;
  /** Every stored record that day is a backfill (reconstructed day). */
  allBackfilled: boolean;
}

export function dayAdherence(
  meds: Record<string, Med>,
  dayRecords: Record<string, DoseRecord> | undefined,
  dateKey: string,
  now: number,
): DayAdherence {
  let expected = 0;
  let due = 0;
  let taken = 0;
  let skipped = 0;
  let records = 0;
  let backfilled = 0;

  for (const [medId, med] of Object.entries(meds)) {
    for (const slot of plannedSlotsFor(med, dateKey)) {
      expected++;
      const isDue = slotEpoch(dateKey, slot) <= now;
      if (isDue) due++;
      const rec = dayRecords?.[scheduledDoseId(medId, slot)];
      if (rec) {
        records++;
        if (rec.backfilled) backfilled++;
        if (rec.status === 'skipped') skipped++;
        else taken++;
      }
    }
  }

  return {
    expected,
    due,
    taken,
    skipped,
    missed: Math.max(0, due - taken - skipped),
    anyRecords: records > 0,
    allBackfilled: records > 0 && backfilled === records,
  };
}

/** Calendar-dot palette: green = all due taken, amber = partial, red =
 * nothing taken, hollow = reconstructed (backfilled) day, none = nothing
 * scheduled or nothing due yet. */
export type DotColor = 'green' | 'amber' | 'red' | 'hollow' | 'none';

export function dayDotColor(a: DayAdherence): DotColor {
  if (a.expected === 0) return 'none';
  if (a.allBackfilled) return 'hollow';
  const acted = a.taken + a.skipped + a.missed; // due slots, resolved or not
  if (acted === 0) return 'none';
  if (a.taken === acted) return 'green';
  if (a.taken === 0) return 'red';
  return 'amber';
}

export interface RangeAdherence {
  due: number;
  taken: number;
  /** 0–100, null when nothing was due in the range. */
  pct: number | null;
}

/** Overall %-taken across a date range (inclusive). Pass a single med in
 * `meds` for per-med stats. */
export function rangeAdherence(
  meds: Record<string, Med>,
  doses: Record<string, Record<string, DoseRecord>>,
  from: string,
  to: string,
  now: number,
): RangeAdherence {
  let due = 0;
  let taken = 0;
  for (const key of dateKeyRange(from, to)) {
    const a = dayAdherence(meds, doses[key], key, now);
    due += a.due;
    taken += a.taken;
  }
  return { due, taken, pct: due > 0 ? Math.round((taken / due) * 100) : null };
}

/** Consecutive fully-taken days ending today (or yesterday when today
 * still has doses pending). Days with nothing scheduled don't break the
 * streak, but don't extend it either. Backfilled days count — the streak
 * is about behavior, and the record says taken. */
export function currentStreak(
  meds: Record<string, Med>,
  doses: Record<string, Record<string, DoseRecord>>,
  now: number,
): number {
  const today = toLocalDateKey(new Date(now));
  let streak = 0;
  let key = today;

  // Today only counts once everything due so far is taken; a miss today
  // breaks the streak outright.
  const t = dayAdherence(meds, doses[today], today, now);
  if (t.due > 0) {
    if (t.taken === t.due) streak++;
    else if (t.missed > 0 || t.skipped > 0) return 0;
  }
  key = addDays(key, -1);

  for (let i = 0; i < 365; i++) {
    const a = dayAdherence(meds, doses[key], key, now);
    if (a.expected === 0) {
      key = addDays(key, -1);
      continue; // nothing scheduled — neutral day
    }
    if (a.taken === a.due && a.due > 0) streak++;
    else break;
    key = addDays(key, -1);
  }
  return streak;
}

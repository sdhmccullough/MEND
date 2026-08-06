// The dose engine. Pure functions only — the UI is a thin shell over this.
//
// Core decision (see README): planned doses are COMPUTED from schedules at
// view time; RTDB stores only actioned records (taken/skipped + backfill).
// 'pending' and 'overdue' are virtual view states; "late" is a derived
// badge. Consequence: editing a schedule reinterprets past UNLOGGED slots
// (logged records are immune — each stores its own plannedAt snapshot).
// If that ever bites, the fix is dated schedule revisions via a migration.

import type { DoseRecord, Med } from './schema';
import { parseDateKey, toLocalDateKey } from './dates';

/** Taken more than an hour after the slot counts as late (badge only). */
export const LATE_THRESHOLD_MS = 60 * 60 * 1000;

/** Deterministic id for a scheduled slot: both spouses tapping the same
 * slot converge on ONE record. */
export function scheduledDoseId(medId: string, slot: string): string {
  return `${medId}_${slot.replace(':', '')}`;
}

/** Epoch ms of a 'HH:MM' slot on a local calendar date. Wall-clock time is
 * preserved across DST transitions (a 23/25-hour day shifts the epoch, not
 * the clock reading — "the 8 AM pill" means 8 AM). */
export function slotEpoch(dateKey: string, slot: string): number {
  const d = parseDateKey(dateKey);
  const [h, m] = slot.split(':').map(Number);
  d.setHours(h, m, 0, 0);
  return d.getTime();
}

/** Whether the med's schedule window covers a date. The `active` flag is
 * deliberately NOT consulted: archiving sets endOn, so history stays put. */
export function medWindowContains(med: Med, dateKey: string): boolean {
  const s = med.schedule;
  if (s.startOn && dateKey < s.startOn) return false;
  if (s.endOn && dateKey > s.endOn) return false;
  return true;
}

/** Dose text for a date, resolving taper steps. Steps are checked in
 * order; the LAST matching step wins, so later refinements override. */
export function doseTextForDate(med: Med, dateKey: string): string {
  let text = med.doseText;
  for (const step of med.schedule.taper) {
    if (!step.from) continue;
    if (dateKey >= step.from && (step.to === null || dateKey <= step.to)) {
      text = step.doseText;
    }
  }
  return text;
}

/** Scheduled 'HH:MM' slots for a med on a date. Only 'times'-kind schedules
 * produce slots; interval and PRN meds have nothing to pre-plan. */
export function plannedSlotsFor(med: Med, dateKey: string): string[] {
  if (med.schedule.kind !== 'times') return [];
  if (!medWindowContains(med, dateKey)) return [];
  return med.schedule.times;
}

export type DoseViewStatus = 'taken' | 'skipped' | 'pending' | 'overdue';

/** One row of a day's dose ledger: a scheduled slot (stored or virtual) or
 * an unscheduled stored record (PRN log, old-schedule snapshot). */
export interface DoseView {
  doseId: string;
  medId: string;
  /** Planned 'HH:MM' slot; null for PRN records. */
  slot: string | null;
  doseText: string;
  status: DoseViewStatus;
  late: boolean;
  takenAt: number | null;
  backfilled: boolean;
  note: string;
  /** True when this row came from the schedule (counts toward adherence). */
  scheduled: boolean;
}

function viewSortKey(v: DoseView): string {
  if (v.slot) return v.slot;
  if (v.takenAt !== null) {
    const d = new Date(v.takenAt);
    return (
      String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0')
    );
  }
  return '99:99';
}

/** Merge the schedule with the day's stored records into a full ledger.
 * Pass only the meds that should appear (e.g. all meds for past-day
 * ledgers; the caller filters nothing — window bounds handle history). */
export function materializeDay(
  meds: Record<string, Med>,
  dayRecords: Record<string, DoseRecord>,
  dateKey: string,
  now: number,
): DoseView[] {
  const views: DoseView[] = [];
  const usedIds = new Set<string>();

  for (const [medId, med] of Object.entries(meds)) {
    for (const slot of plannedSlotsFor(med, dateKey)) {
      const id = scheduledDoseId(medId, slot);
      const rec = dayRecords[id];
      const doseText = doseTextForDate(med, dateKey);
      if (rec) {
        usedIds.add(id);
        views.push({
          doseId: id,
          medId,
          slot,
          doseText,
          status: rec.status === 'skipped' ? 'skipped' : 'taken',
          late:
            rec.takenAt !== null &&
            rec.takenAt > slotEpoch(dateKey, slot) + LATE_THRESHOLD_MS,
          takenAt: rec.takenAt,
          backfilled: rec.backfilled,
          note: rec.note,
          scheduled: true,
        });
      } else {
        views.push({
          doseId: id,
          medId,
          slot,
          doseText,
          status: slotEpoch(dateKey, slot) <= now ? 'overdue' : 'pending',
          late: false,
          takenAt: null,
          backfilled: false,
          note: '',
          scheduled: true,
        });
      }
    }
  }

  // Stored records the current schedule doesn't cover: PRN/interval logs,
  // or slots logged under an older schedule (their plannedAt snapshot).
  for (const [id, rec] of Object.entries(dayRecords)) {
    if (usedIds.has(id)) continue;
    const med = meds[rec.medId];
    views.push({
      doseId: id,
      medId: rec.medId,
      slot: rec.plannedAt,
      doseText: med ? doseTextForDate(med, dateKey) : '',
      status: rec.status === 'skipped' ? 'skipped' : 'taken',
      late: false,
      takenAt: rec.takenAt,
      backfilled: rec.backfilled,
      note: rec.note,
      scheduled: false,
    });
  }

  return views.sort((a, b) => viewSortKey(a).localeCompare(viewSortKey(b)));
}

/** Most recent takenAt for a med across the whole doses tree. Anchors
 * interval ("every N hours") scheduling. */
export function lastTakenAtForMed(
  doses: Record<string, Record<string, DoseRecord>>,
  medId: string,
): number | null {
  let last: number | null = null;
  for (const day of Object.values(doses)) {
    for (const rec of Object.values(day)) {
      if (rec.medId === medId && rec.takenAt !== null && (last === null || rec.takenAt > last)) {
        last = rec.takenAt;
      }
    }
  }
  return last;
}

export interface IntervalDue {
  /** Next due time; null when unknowable (never taken, or not interval). */
  dueAt: number | null;
  dueNow: boolean;
}

/** When an every-N-hours med is next due, anchored to the last taken dose.
 * Never taken → due now (the clock starts with the first dose). */
export function intervalNextDue(med: Med, lastTaken: number | null, now: number): IntervalDue {
  if (med.schedule.kind !== 'interval' || med.schedule.everyHours === null) {
    return { dueAt: null, dueNow: false };
  }
  if (!medWindowContains(med, toLocalDateKey(new Date(now)))) {
    return { dueAt: null, dueNow: false };
  }
  if (lastTaken === null) return { dueAt: null, dueNow: true };
  const dueAt = lastTaken + med.schedule.everyHours * 3_600_000;
  return { dueAt, dueNow: dueAt <= now };
}

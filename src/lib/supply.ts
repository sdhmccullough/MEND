// Pills-remaining countdown and the narcotic "last dose" notice.
//
// Remaining is an estimate from what's been LOGGED since the fill date —
// it can only be as good as the logging, so the UI says "≈".

import type { DoseRecord, Med } from './schema';
import { epochToDateKey } from './dates';

export interface Supply {
  /** Units dispensed. */
  filled: number;
  used: number;
  remaining: number;
  /** Doses per day averaged over the fill window; null when unknowable. */
  perDay: number | null;
  /** Whole days of supply left at that rate; null when unknowable. */
  daysLeft: number | null;
  low: boolean;
}

/** Units logged for a med on/after its fill date (skipped doses don't count). */
export function unitsUsed(
  doses: Record<string, Record<string, DoseRecord>>,
  medId: string,
  filledOn: string,
): number {
  let used = 0;
  for (const [dateKey, day] of Object.entries(doses)) {
    if (dateKey < filledOn) continue;
    for (const r of Object.values(day)) {
      if (r.medId === medId && r.status !== 'skipped') used += r.units || 1;
    }
  }
  return used;
}

/** Scheduled meds burn a predictable amount per day; PRN meds use the
 * observed average. Returns null when there's nothing to project from. */
function ratePerDay(med: Med, used: number, daysElapsed: number): number | null {
  if (med.schedule.kind === 'times' && med.schedule.times.length > 0) {
    return med.schedule.times.length;
  }
  if (daysElapsed <= 0 || used === 0) return null;
  return used / daysElapsed;
}

export function medSupply(
  med: Med,
  medId: string,
  doses: Record<string, Record<string, DoseRecord>>,
  now: number,
  lowDays = 5,
): Supply | null {
  if (med.fillQuantity === null || !med.filledOn) return null;
  const used = unitsUsed(doses, medId, med.filledOn);
  const remaining = Math.max(0, med.fillQuantity - used);
  const todayKey = epochToDateKey(now);
  const daysElapsed =
    (Date.parse(todayKey) - Date.parse(med.filledOn)) / 86_400_000 + 1;
  const perDay = ratePerDay(med, used, daysElapsed);
  const daysLeft = perDay && perDay > 0 ? Math.floor(remaining / perDay) : null;
  return {
    filled: med.fillQuantity,
    used,
    remaining,
    perDay,
    daysLeft,
    low: daysLeft !== null ? daysLeft <= lowDays : remaining <= 2,
  };
}

export interface NarcoticStatus {
  medName: string;
  lastAt: number;
  minutesSince: number;
}

/** Most recent dose of any med flagged noDriving. The UI reports the
 * elapsed time and the discharge instruction — it never certifies that
 * driving is safe; that's the care team's call. */
export function lastNarcoticDose(
  meds: Record<string, Med>,
  doses: Record<string, Record<string, DoseRecord>>,
  now: number,
): NarcoticStatus | null {
  let best: NarcoticStatus | null = null;
  for (const day of Object.values(doses)) {
    for (const r of Object.values(day)) {
      const med = meds[r.medId];
      if (!med?.noDriving || r.takenAt === null || r.status === 'skipped') continue;
      if (best === null || r.takenAt > best.lastAt) {
        best = {
          medName: med.name,
          lastAt: r.takenAt,
          minutesSince: Math.floor((now - r.takenAt) / 60_000),
        };
      }
    }
  }
  return best;
}

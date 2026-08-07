// Dose-spacing reminders: "keep N hours between A and B", as instructed by
// the care team and entered by hand. Mend does NOT do drug-interaction
// checking — it only surfaces rules a human recorded, at the moment the
// dose is being logged.
//
// The result is always advisory. Logging is never blocked: the record must
// reflect what actually happened, and a pain med is not something an app
// should refuse.

import type { DoseRecord, Med, SpacingRule } from './schema';

export interface SpacingConflict {
  otherMedId: string;
  otherMedName: string;
  hours: number;
  lastTakenAt: number;
  /** When the spacing window closes. */
  clearAt: number;
  minutesRemaining: number;
  note: string;
}

/** Most recent taken dose of a med, epoch ms; null if never. */
export function lastTakenAt(
  doses: Record<string, Record<string, DoseRecord>>,
  medId: string,
): number | null {
  let last: number | null = null;
  for (const day of Object.values(doses)) {
    for (const r of Object.values(day)) {
      if (r.medId !== medId || r.status === 'skipped' || r.takenAt === null) continue;
      if (last === null || r.takenAt > last) last = r.takenAt;
    }
  }
  return last;
}

/** Rules that are currently unsatisfied for `medId` — i.e. the paired med
 * was taken too recently. Rules apply in both directions. */
export function spacingConflicts(
  medId: string,
  rules: Record<string, SpacingRule>,
  meds: Record<string, Med>,
  doses: Record<string, Record<string, DoseRecord>>,
  now: number,
): SpacingConflict[] {
  const out: SpacingConflict[] = [];
  for (const rule of Object.values(rules)) {
    if (rule.hours <= 0) continue;
    let otherId: string | null = null;
    if (rule.medA === medId) otherId = rule.medB;
    else if (rule.medB === medId) otherId = rule.medA;
    if (otherId === null) continue;

    const last = lastTakenAt(doses, otherId);
    if (last === null) continue;
    const clearAt = last + rule.hours * 3_600_000;
    if (clearAt <= now) continue;

    out.push({
      otherMedId: otherId,
      otherMedName: meds[otherId]?.name ?? 'another medication',
      hours: rule.hours,
      lastTakenAt: last,
      clearAt,
      minutesRemaining: Math.ceil((clearAt - now) / 60_000),
      note: rule.note,
    });
  }
  return out.sort((a, b) => b.clearAt - a.clearAt);
}

/** Every rule touching a med, for display on the med itself. */
export function rulesForMed(
  medId: string,
  rules: Record<string, SpacingRule>,
  meds: Record<string, Med>,
): Array<{ otherMedName: string; hours: number; note: string }> {
  return Object.values(rules)
    .filter((r) => r.hours > 0 && (r.medA === medId || r.medB === medId))
    .map((r) => ({
      otherMedName: meds[r.medA === medId ? r.medB : r.medA]?.name ?? 'another medication',
      hours: r.hours,
      note: r.note,
    }));
}

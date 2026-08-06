// Chart-data assembly for the Progress screen. Pure and tested; the
// Recharts panel is a thin renderer over these shapes.

import type { DayMetric, DoseRecord, Med, PtSession } from './schema';
import { rangeAdherence } from './adherence';
import { addDays, dateKeyRange, epochToDateKey, formatShort, parseDateKey, toLocalDateKey } from './dates';

export interface PainPoint {
  dateKey: string;
  label: string;
  pain: number | null;
  ptPre: number | null;
  ptPost: number | null;
}

/** Daily pain (quick-log) with PT pre/post overlaid on session days. */
export function buildPainSeries(
  metrics: Record<string, DayMetric>,
  ptSessions: Record<string, PtSession>,
  fromKey: string,
  toKey: string,
): PainPoint[] {
  const byDay = new Map<string, { pre: number | null; post: number | null }>();
  for (const s of Object.values(ptSessions)) {
    const key = epochToDateKey(s.at);
    // Multiple sessions a day: keep the last one's readings.
    byDay.set(key, { pre: s.painPre, post: s.painPost });
  }
  return dateKeyRange(fromKey, toKey).map((dateKey) => ({
    dateKey,
    label: formatShort(parseDateKey(dateKey)),
    pain: metrics[dateKey]?.pain ?? null,
    ptPre: byDay.get(dateKey)?.pre ?? null,
    ptPost: byDay.get(dateKey)?.post ?? null,
  }));
}

export interface RomPoint {
  dateKey: string;
  label: string;
  degrees: number;
}

export interface RomSeries {
  joint: string;
  points: RomPoint[];
}

/** ROM trend per joint from PT sessions + daily metrics, most-measured
 * joints first, capped so the chart stays readable. */
export function buildRomSeries(
  metrics: Record<string, DayMetric>,
  ptSessions: Record<string, PtSession>,
  limit = 3,
): RomSeries[] {
  const byJoint = new Map<string, Map<string, number>>();
  const add = (joint: string, dateKey: string, degrees: number) => {
    const m = byJoint.get(joint) ?? new Map<string, number>();
    m.set(dateKey, degrees); // last measurement of the day wins
    byJoint.set(joint, m);
  };
  for (const [dateKey, m] of Object.entries(metrics)) {
    for (const [joint, deg] of Object.entries(m.rom)) add(joint, dateKey, deg);
  }
  for (const s of Object.values(ptSessions)) {
    const dateKey = epochToDateKey(s.at);
    for (const [joint, deg] of Object.entries(s.rom)) add(joint, dateKey, deg);
  }
  return [...byJoint.entries()]
    .sort((a, b) => b[1].size - a[1].size)
    .slice(0, limit)
    .map(([joint, m]) => ({
      joint,
      points: [...m.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([dateKey, degrees]) => ({
          dateKey,
          label: formatShort(parseDateKey(dateKey)),
          degrees,
        })),
    }));
}

/** Sunday-start week key for a date (matches the calendar grid). */
export function weekStartOf(dateKey: string): string {
  const d = parseDateKey(dateKey);
  d.setDate(d.getDate() - d.getDay());
  return toLocalDateKey(d);
}

export interface WeekBucket {
  weekStart: string;
  label: string;
  sessions: number;
  adherencePct: number | null;
}

/** Last `nWeeks` week buckets (oldest first): PT session count + med
 * adherence percent per week. */
export function buildWeekBuckets(
  ptSessions: Record<string, PtSession>,
  meds: Record<string, Med>,
  doses: Record<string, Record<string, DoseRecord>>,
  nWeeks: number,
  now: number,
): WeekBucket[] {
  const thisWeek = weekStartOf(toLocalDateKey(new Date(now)));
  const sessionCounts = new Map<string, number>();
  for (const s of Object.values(ptSessions)) {
    const wk = weekStartOf(epochToDateKey(s.at));
    sessionCounts.set(wk, (sessionCounts.get(wk) ?? 0) + 1);
  }
  const buckets: WeekBucket[] = [];
  for (let i = nWeeks - 1; i >= 0; i--) {
    const weekStart = addDays(thisWeek, -7 * i);
    const weekEnd = addDays(weekStart, 6);
    const adherence = rangeAdherence(meds, doses, weekStart, weekEnd, now);
    buckets.push({
      weekStart,
      label: formatShort(parseDateKey(weekStart)),
      sessions: sessionCounts.get(weekStart) ?? 0,
      adherencePct: adherence.pct,
    });
  }
  return buckets;
}

/** Days since the injury (day zero); null when no injury date set. */
export function daysSinceInjury(occurredOn: string, now: number): number | null {
  if (!occurredOn) return null;
  const ms = parseDateKey(toLocalDateKey(new Date(now))).getTime() - parseDateKey(occurredOn).getTime();
  return Math.max(0, Math.round(ms / 86_400_000));
}

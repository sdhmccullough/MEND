// Recurring care tasks (ice, elbow out of the sling, pendulums). Pure
// counting + cadence so the Today chips stay a thin shell.

import type { Routine, RoutineLog } from './schema';

export interface RoutineStatus {
  id: string;
  routine: Routine;
  doneToday: number;
  /** Most recent log today, epoch ms; null if none yet. */
  lastAt: number | null;
  /** Minutes since the last rep; null if never. */
  minutesSince: number | null;
  /** Cadence elapsed (or never done) and the daily target isn't met. */
  due: boolean;
  complete: boolean;
}

export function routineStatuses(
  routines: Record<string, Routine>,
  todayLogs: Record<string, RoutineLog> | undefined,
  now: number,
): RoutineStatus[] {
  const logs = Object.values(todayLogs ?? {});
  return Object.entries(routines)
    .filter(([, r]) => r.active)
    .sort(([, a], [, b]) => a.order - b.order || a.label.localeCompare(b.label))
    .map(([id, routine]) => {
      const mine = logs.filter((l) => l.routineId === id);
      const lastAt = mine.reduce<number | null>(
        (max, l) => (max === null || l.at > max ? l.at : max),
        null,
      );
      const minutesSince = lastAt === null ? null : Math.floor((now - lastAt) / 60_000);
      const doneToday = mine.length;
      const complete = doneToday >= routine.targetPerDay;
      const cadenceElapsed =
        routine.everyMinutes === 0
          ? true
          : minutesSince === null || minutesSince >= routine.everyMinutes;
      return {
        id,
        routine,
        doneToday,
        lastAt,
        minutesSince,
        due: !complete && cadenceElapsed,
        complete,
      };
    });
}

/** Seconds left on a countdown; negative once it's up, null if none. */
export function secondsLeft(dueAt: number | undefined, now: number): number | null {
  if (dueAt === undefined) return null;
  return Math.round((dueAt - now) / 1000);
}

/** "24:31" counting down, "0:00" once elapsed. */
export function countdownLabel(seconds: number): string {
  const s = Math.max(0, seconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** "47m ago" / "2h 10m ago" / "not yet today". */
export function sinceLabel(minutesSince: number | null): string {
  if (minutesSince === null) return 'not yet today';
  if (minutesSince < 1) return 'just now';
  if (minutesSince < 60) return `${minutesSince}m ago`;
  const h = Math.floor(minutesSince / 60);
  const m = minutesSince % 60;
  return m === 0 ? `${h}h ago` : `${h}h ${m}m ago`;
}

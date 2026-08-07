import { useEffect, useState } from 'react';
import { useStore } from '../../store/useStore';
import { cancelRoutineTimer } from '../../store/sync';
import { countdownLabel, secondsLeft } from '../../lib/routines';
import { formatEpochTime } from '../../lib/dates';
import { Card } from '../../components/ui/Card';
import { toastError } from '../../components/ui/Toast';

/** Running countdowns, pinned at the top of Today so "is the ice timer
 * going?" is answerable at a glance rather than by scrolling. */
export function ActiveTimers() {
  const timers = useStore((s) => s.timers);
  const routines = useStore((s) => s.routines);
  const entries = Object.entries(timers);

  const [, tick] = useState(0);
  useEffect(() => {
    if (entries.length === 0) return;
    const t = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [entries.length]);

  if (entries.length === 0) return null;
  const now = Date.now();

  return (
    <>
      {entries.map(([routineId, timer]) => {
        const left = secondsLeft(timer.dueAt, now) ?? 0;
        const elapsed = left <= 0;
        const total = Math.max(
          1,
          Math.round((timer.dueAt - timer.startedAt) / 1000),
        );
        const pct = elapsed ? 100 : Math.min(100, ((total - left) / total) * 100);
        const minutes = routines[routineId]?.timerMinutes || Math.round(total / 60);
        return (
          <Card
            key={routineId}
            className={elapsed ? 'border-warn bg-warn/10' : 'border-accent-strong/40'}
          >
            <div className="flex items-center gap-4">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">
                  {elapsed ? '⏰ ' : ''}
                  {timer.label || 'Timer'}
                </p>
                <p className={`text-xs ${elapsed ? 'font-medium text-warn' : 'text-muted'}`}>
                  {elapsed
                    ? `${minutes} minutes are up — take it off`
                    : `started ${formatEpochTime(timer.startedAt)} · ${minutes} min`}
                </p>
              </div>
              <span
                className={`shrink-0 text-3xl font-bold tabular-nums ${elapsed ? 'text-warn' : 'text-accent-strong'}`}
                aria-live="off"
              >
                {countdownLabel(left)}
              </span>
            </div>
            <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-surface-2">
              <div
                className={`h-full rounded-full transition-[width] duration-1000 ease-linear ${
                  elapsed ? 'bg-warn' : 'bg-accent-strong'
                }`}
                style={{ width: `${pct}%` }}
              />
            </div>
            <button
              type="button"
              onClick={() =>
                cancelRoutineTimer(routineId).catch(() => toastError('Not synced'))
              }
              className="mt-2 min-h-11 w-full rounded-(--radius-control) border border-line text-sm font-semibold transition active:scale-[0.98]"
            >
              {elapsed ? 'Clear' : 'Stop timer'}
            </button>
          </Card>
        );
      })}
    </>
  );
}

import { useEffect, useState } from 'react';
import { useStore } from '../../store/useStore';
import { logRoutine } from '../../store/sync';
import { routineStatuses, sinceLabel } from '../../lib/routines';
import { todayKey } from '../../lib/dates';
import { Card, SectionLabel } from '../../components/ui/Card';
import { toastError } from '../../components/ui/Toast';

/** One-tap logging for the high-frequency discharge instructions (ice
 * every 1–2 h, elbow out of the sling 3× a day). Big targets: this gets
 * used one-handed, many times a day. */
export function RoutineChips() {
  const routines = useStore((s) => s.routines);
  const today = todayKey();
  const todayLogs = useStore((s) => s.routineLogs[today]);
  const [busy, setBusy] = useState<string | null>(null);

  // "47m ago" goes stale while the screen sits open; re-render each minute.
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 60_000);
    return () => clearInterval(t);
  }, []);

  const statuses = routineStatuses(routines, todayLogs, Date.now());
  if (statuses.length === 0) return null;

  return (
    <Card>
      <SectionLabel>Routine care</SectionLabel>
      <ul className="mt-2 space-y-1.5">
        {statuses.map((s) => (
          <li key={s.id}>
            <button
              type="button"
              disabled={busy === s.id}
              onClick={() => {
                setBusy(s.id);
                logRoutine(s.id, today)
                  .catch(() => toastError('Not synced', 'Try again.'))
                  .finally(() => setBusy(null));
              }}
              className={`flex min-h-14 w-full items-center gap-3 rounded-(--radius-control) px-3 text-left transition active:scale-[0.99] ${
                s.due
                  ? 'bg-accent-soft ring-1 ring-accent-strong/30'
                  : 'bg-surface-2'
              }`}
              aria-label={`Log ${s.routine.label}. ${s.doneToday} of ${s.routine.targetPerDay} today, last ${sinceLabel(s.minutesSince)}.`}
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">
                  {s.routine.label}
                  {s.complete ? <span className="text-accent"> ✓</span> : null}
                </span>
                <span
                  className={`block text-xs ${s.due ? 'font-medium text-accent-strong' : 'text-muted'}`}
                >
                  {s.doneToday}/{s.routine.targetPerDay} today · {sinceLabel(s.minutesSince)}
                  {s.due ? ' · due' : ''}
                </span>
              </span>
              <span className="shrink-0 rounded-full bg-accent-strong px-4 py-2 text-sm font-semibold text-white">
                {busy === s.id ? '…' : '+1'}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </Card>
  );
}

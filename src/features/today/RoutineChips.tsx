import { useEffect, useState } from 'react';
import { useStore } from '../../store/useStore';
import {
  cancelRoutineTimer,
  logRoutine,
  startRoutineTimer,
  undoRoutineLog,
} from '../../store/sync';
import {
  countdownLabel,
  routineStatuses,
  secondsLeft,
  sinceLabel,
  type RoutineStatus,
} from '../../lib/routines';
import { formatEpochTime, todayKey } from '../../lib/dates';
import { Card, SectionLabel } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Dialog } from '../../components/ui/Dialog';
import { toast, toastError } from '../../components/ui/Toast';
import { MoreIcon, TrashIcon } from '../../components/icons';

/** One-tap logging for the high-frequency discharge instructions (ice
 * every 1–2 h, elbow out of the sling 3× a day). Big targets: this gets
 * used one-handed, many times a day. Routines with a duration (ice = 30
 * min) start a server-side countdown that pushes when it's up. */
export function RoutineChips() {
  const routines = useStore((s) => s.routines);
  const timers = useStore((s) => s.timers);
  const today = todayKey();
  const todayLogs = useStore((s) => s.routineLogs[today]);
  const [busy, setBusy] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);

  const statuses = routineStatuses(routines, todayLogs, Date.now());
  const anyTimer = statuses.some((s) => timers[s.id] !== undefined);

  // Countdowns need a second-by-second tick; otherwise a minute is plenty.
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), anyTimer ? 1000 : 60_000);
    return () => clearInterval(t);
  }, [anyTimer]);

  if (statuses.length === 0) return null;
  const now = Date.now();

  const logRep = (s: RoutineStatus) => {
    setBusy(s.id);
    logRoutine(s.id, today)
      .then(() => {
        if (s.routine.timerMinutes > 0) {
          return startRoutineTimer(s.id, s.routine.label, s.routine.timerMinutes);
        }
        return undefined;
      })
      .catch(() => toastError('Not synced', 'Try again.'))
      .finally(() => setBusy(null));
  };

  return (
    <Card>
      <SectionLabel>Routine care</SectionLabel>
      <ul className="mt-2 space-y-1.5">
        {statuses.map((s) => {
          const timer = timers[s.id];
          const left = secondsLeft(timer?.dueAt, now);
          const running = left !== null && left > 0;
          const elapsed = left !== null && left <= 0;
          return (
            <li key={s.id} className="space-y-1">
              <div className="flex items-stretch gap-1.5">
                <button
                  type="button"
                  disabled={busy === s.id}
                  onClick={() => logRep(s)}
                  className={`flex min-h-14 flex-1 items-center gap-3 rounded-(--radius-control) px-3 text-left transition active:scale-[0.99] ${
                    s.due ? 'bg-accent-soft ring-1 ring-accent-strong/30' : 'bg-surface-2'
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
                      {s.doneToday}/{s.routine.targetPerDay} today ·{' '}
                      {sinceLabel(s.minutesSince)}
                      {s.due ? ' · due' : ''}
                      {s.complete ? ' · done for today' : ''}
                      {s.minutesUntilDue !== null
                        ? ` · next in ${sinceLabel(s.minutesUntilDue).replace(' ago', '')}`
                        : ''}
                    </span>
                  </span>
                  <span className="shrink-0 rounded-full bg-accent-strong px-4 py-2 text-sm font-semibold text-white">
                    {busy === s.id ? '…' : '+1'}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setEditing(s.id)}
                  aria-label={`Edit today's ${s.routine.label} entries`}
                  className="flex w-12 shrink-0 items-center justify-center rounded-(--radius-control) bg-surface-2 text-muted transition hover:text-ink active:scale-95"
                >
                  <MoreIcon className="size-5" />
                </button>
              </div>

              {running || elapsed ? (
                <div
                  className={`flex items-center justify-between gap-2 rounded-(--radius-control) px-3 py-2 text-xs ${
                    elapsed
                      ? 'border border-warn/40 bg-surface-2 font-medium text-warn'
                      : 'bg-surface-2 text-muted'
                  }`}
                >
                  <span>
                    {elapsed ? (
                      `${s.routine.timerMinutes} minutes up — take it off`
                    ) : (
                      <>
                        <span className="font-semibold tabular-nums text-ink">
                          {countdownLabel(left as number)}
                        </span>{' '}
                        left of {s.routine.timerMinutes} min
                      </>
                    )}
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      cancelRoutineTimer(s.id).catch(() => toastError('Not synced'))
                    }
                    className="shrink-0 rounded-full bg-surface px-3 py-1 font-semibold"
                  >
                    {elapsed ? 'Clear' : 'Stop'}
                  </button>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>

      {editing ? (
        <RoutineLogEditor
          routineId={editing}
          dateKey={today}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </Card>
  );
}

/** Fix mis-taps: today's reps listed with times, each removable. */
function RoutineLogEditor({
  routineId,
  dateKey,
  onClose,
}: {
  routineId: string;
  dateKey: string;
  onClose: () => void;
}) {
  const routine = useStore((s) => s.routines[routineId]);
  const dayLogs = useStore((s) => s.routineLogs[dateKey]) ?? {};
  const [busy, setBusy] = useState<string | null>(null);

  const mine = Object.entries(dayLogs)
    .filter(([, l]) => l.routineId === routineId)
    .sort(([, a], [, b]) => a.at - b.at);

  return (
    <Dialog
      open
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
      title={routine?.label ?? 'Routine'}
      description={`${mine.length} of ${routine?.targetPerDay ?? 0} logged today. Remove any you tapped by mistake.`}
    >
      <div className="space-y-3">
        {mine.length === 0 ? (
          <p className="text-sm text-muted">Nothing logged today.</p>
        ) : (
          <ul className="space-y-1.5">
            {mine.map(([id, log], i) => (
              <li
                key={id}
                className="flex min-h-11 items-center justify-between gap-2 rounded-(--radius-control) bg-surface-2 px-3 text-sm"
              >
                <span>
                  <span className="font-medium">#{i + 1}</span>
                  <span className="text-muted"> · {formatEpochTime(log.at)}</span>
                </span>
                <button
                  type="button"
                  disabled={busy === id}
                  onClick={() => {
                    setBusy(id);
                    undoRoutineLog(dateKey, id)
                      .then(() => toast('Entry removed'))
                      .catch(() => toastError('Not synced', 'Try again.'))
                      .finally(() => setBusy(null));
                  }}
                  aria-label={`Remove entry ${i + 1} at ${formatEpochTime(log.at)}`}
                  className="flex size-9 items-center justify-center rounded-full text-danger transition active:scale-95"
                >
                  <TrashIcon className="size-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
        <Button variant="ghost" className="w-full" onClick={onClose}>
          Done
        </Button>
      </div>
    </Dialog>
  );
}

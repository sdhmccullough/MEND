import { useState } from 'react';
import { useStore } from '../../store/useStore';
import { logDoseTaken, logPrnDose, skipDose, undoDose } from '../../store/sync';
import {
  intervalNextDue,
  lastTakenAtForMed,
  materializeDay,
  doseTextForDate,
  plannedSlotsFor,
  type DoseView,
} from '../../lib/doses';
import { currentStreak, dayAdherence } from '../../lib/adherence';
import { formatEpochTime, formatHHMM12, nowHHMM, parseDateKey, todayKey } from '../../lib/dates';
import { Card, SectionLabel } from '../../components/ui/Card';
import { Dialog } from '../../components/ui/Dialog';
import { Button } from '../../components/ui/Button';
import { Field, TextInput, inputClass } from '../../components/ui/Field';
import { toast, toastError } from '../../components/ui/Toast';
import { CheckIcon, ClockIcon, MoreIcon, XIcon } from '../../components/icons';

function StatusDot({ view }: { view: DoseView }) {
  if (view.status === 'taken') {
    return (
      <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-accent-strong text-white">
        <CheckIcon className="size-4" />
      </span>
    );
  }
  if (view.status === 'skipped') {
    return (
      <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-surface-2 text-muted">
        <XIcon className="size-4" />
      </span>
    );
  }
  return (
    <span
      className={`size-7 shrink-0 rounded-full border-2 ${
        view.status === 'overdue' ? 'border-warn' : 'border-line'
      }`}
      aria-hidden="true"
    />
  );
}

function statusLine(view: DoseView): string {
  if (view.status === 'taken') {
    const at = view.takenAt !== null ? formatEpochTime(view.takenAt) : 'time unknown';
    return `Taken ${view.takenAt !== null ? at : ''}${view.late ? ' · late' : ''}${view.backfilled ? ' · backfilled' : ''}`;
  }
  if (view.status === 'skipped') return `Skipped${view.note ? ` — ${view.note}` : ''}`;
  if (view.status === 'overdue') return 'Overdue';
  return 'Upcoming';
}

/** Options for one dose: taken-at-time, skip with reason, undo. */
function DoseOptionsDialog({
  view,
  medName,
  dateKey,
  onClose,
}: {
  view: DoseView;
  medName: string;
  dateKey: string;
  onClose: () => void;
}) {
  const [time, setTime] = useState(view.slot ?? nowHHMM());
  const [reason, setReason] = useState('');
  const fail = () => toastError('Not synced', 'Try again.');
  const done = () => onClose();

  const takenAtEpoch = (hhmm: string): number => {
    const d = parseDateKey(dateKey);
    const [h, m] = hhmm.split(':').map(Number);
    d.setHours(h, m, 0, 0);
    return d.getTime();
  };

  return (
    <Dialog
      open
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
      title={`${medName} · ${view.slot ? formatHHMM12(view.slot) : 'dose'}`}
    >
      <div className="space-y-4">
        {view.slot !== null && !view.backfilled ? (
          <div className="space-y-2">
            <Field label="Mark taken at">
              <div className="flex gap-2">
                <input
                  type="time"
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                  className={`${inputClass} flex-1`}
                  aria-label="Time taken"
                />
                <Button
                  variant="primary"
                  onClick={() =>
                    logDoseTaken(view.medId, dateKey, view.slot as string, takenAtEpoch(time))
                      .then(done)
                      .catch(fail)
                  }
                >
                  Taken
                </Button>
              </div>
            </Field>
            <Field label="Or skip with a reason">
              <div className="flex gap-2">
                <TextInput
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Nauseous, saving for bedtime…"
                  className="flex-1"
                />
                <Button
                  onClick={() =>
                    skipDose(view.medId, dateKey, view.slot as string, reason.trim())
                      .then(done)
                      .catch(fail)
                  }
                >
                  Skip
                </Button>
              </div>
            </Field>
          </div>
        ) : null}
        {(view.status === 'taken' || view.status === 'skipped') && !view.backfilled ? (
          <Button
            variant="danger"
            className="w-full"
            onClick={() =>
              undoDose(dateKey, view.doseId)
                .then(() => {
                  toast('Entry cleared');
                  done();
                })
                .catch(fail)
            }
          >
            Undo this entry
          </Button>
        ) : null}
        {view.backfilled ? (
          <p className="text-xs text-muted">
            Backfilled entries are part of the reconstructed history and can't be
            edited or removed.
          </p>
        ) : null}
      </div>
    </Dialog>
  );
}

export function DoseChecklist() {
  const meds = useStore((s) => s.meds);
  const doses = useStore((s) => s.doses);
  const today = todayKey();
  const now = Date.now();

  // Cheap enough to recompute per render — a handful of meds, one day.
  const activeMeds = Object.fromEntries(
    Object.entries(meds).filter(([, m]) => m.active),
  );
  const dayRecords = doses[today] ?? {};
  const views = materializeDay(activeMeds, dayRecords, today, now).filter(
    (v) => v.scheduled,
  );
  // PRN/interval meds, plus scheduled meds with no slots today (e.g. a
  // script filled mid-day before its schedule starts) — still loggable.
  const asNeeded = Object.entries(activeMeds).filter(
    ([, m]) => m.schedule.kind !== 'times' || plannedSlotsFor(m, today).length === 0,
  );

  const [optionsFor, setOptionsFor] = useState<DoseView | null>(null);

  const tap = (view: DoseView) => {
    if (view.status === 'pending' || view.status === 'overdue') {
      logDoseTaken(view.medId, today, view.slot as string).catch(() =>
        toastError('Not synced', 'Try again.'),
      );
    } else {
      setOptionsFor(view);
    }
  };

  const adherence = dayAdherence(activeMeds, dayRecords, today, now);
  const streak = currentStreak(activeMeds, doses, now);

  if (views.length === 0 && asNeeded.length === 0) {
    return (
      <Card>
        <SectionLabel>Today's meds</SectionLabel>
        <p className="mt-1.5 text-sm text-muted">
          No meds scheduled. Add them on the Meds tab.
        </p>
      </Card>
    );
  }

  return (
    <Card>
      <div className="flex items-baseline justify-between">
        <SectionLabel>Today's meds</SectionLabel>
        <span className="text-xs text-muted tabular-nums">
          {adherence.expected > 0
            ? `${adherence.taken}/${adherence.expected} taken`
            : ''}
          {streak > 1 ? ` · ${streak}-day streak` : ''}
        </span>
      </div>

      {views.length > 0 ? (
        <ul className="mt-2 space-y-1.5">
          {views.map((v) => (
            <li key={v.doseId} className="flex items-stretch gap-1.5">
              <button
                type="button"
                className="flex min-h-14 flex-1 items-center gap-3 rounded-(--radius-control) bg-surface-2 px-3 text-left transition active:scale-[0.99]"
                onClick={() => tap(v)}
                aria-label={`${meds[v.medId]?.name ?? 'Med'} ${v.slot ? formatHHMM12(v.slot) : ''}: ${statusLine(v)}. Tap to ${v.status === 'pending' || v.status === 'overdue' ? 'mark taken' : 'edit'}.`}
              >
                <StatusDot view={v} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">
                    {meds[v.medId]?.name ?? 'Unknown med'}
                    <span className="font-normal text-muted"> · {v.doseText}</span>
                  </span>
                  <span
                    className={`block text-xs ${v.status === 'overdue' ? 'font-medium text-warn' : 'text-muted'}`}
                  >
                    {v.slot ? formatHHMM12(v.slot) : ''} — {statusLine(v)}
                  </span>
                </span>
              </button>
              {/* Visible options button — a long-press is hard to land
                  one-handed with a sling on. */}
              <button
                type="button"
                onClick={() => setOptionsFor(v)}
                aria-label={`Options for ${meds[v.medId]?.name ?? 'med'} ${v.slot ? formatHHMM12(v.slot) : ''}`}
                className="flex w-12 shrink-0 items-center justify-center rounded-(--radius-control) bg-surface-2 text-muted transition active:scale-95 hover:text-ink"
              >
                <MoreIcon className="size-5" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {asNeeded.length > 0 ? (
        <div className="mt-3 space-y-1.5">
          <span className="text-xs font-medium text-muted">As needed</span>
          {asNeeded.map(([medId, med]) => {
            const last = lastTakenAtForMed(doses, medId);
            const due = intervalNextDue(med, last, now);
            return (
              <div
                key={medId}
                className="flex items-center gap-3 rounded-(--radius-control) bg-surface-2 px-3 py-2"
              >
                <ClockIcon className="size-5 shrink-0 text-muted" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">
                    {med.name}
                    <span className="font-normal text-muted">
                      {' '}
                      · {doseTextForDate(med, today)}
                    </span>
                  </span>
                  <span className="block text-xs text-muted">
                    {last !== null ? `Last taken ${formatEpochTime(last)}` : 'Not taken yet'}
                    {due.dueAt !== null
                      ? due.dueNow
                        ? ' · due now'
                        : ` · next ${formatEpochTime(due.dueAt)}`
                      : ''}
                    {med.schedule.kind === 'times' ? ' · not on today’s schedule' : ''}
                  </span>
                </span>
                {med.variableDose ? (
                  // Dose is a range (e.g. 1–2 tablets): record how many, so
                  // the supply countdown stays honest.
                  <span className="flex shrink-0 gap-1">
                    {[1, 2].map((n) => (
                      <Button
                        key={n}
                        variant={due.dueNow && n === 1 ? 'primary' : 'outline'}
                        className="!min-h-11 !px-3"
                        onClick={() =>
                          logPrnDose(medId, '', n)
                            .then(() => toast('Dose logged', `${med.name} · ${n}`))
                            .catch(() => toastError('Not synced', 'Try again.'))
                        }
                        aria-label={`Log ${n} ${n === 1 ? 'tablet' : 'tablets'} of ${med.name}`}
                      >
                        {n}
                      </Button>
                    ))}
                  </span>
                ) : (
                  <Button
                    variant={due.dueNow ? 'primary' : 'outline'}
                    className="!min-h-11 shrink-0"
                    onClick={() =>
                      logPrnDose(medId)
                        .then(() => toast('Dose logged', med.name))
                        .catch(() => toastError('Not synced', 'Try again.'))
                    }
                  >
                    Take now
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      ) : null}

      {optionsFor ? (
        <DoseOptionsDialog
          view={optionsFor}
          medName={meds[optionsFor.medId]?.name ?? 'Med'}
          dateKey={today}
          onClose={() => setOptionsFor(null)}
        />
      ) : null}
    </Card>
  );
}

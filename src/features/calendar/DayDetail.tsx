import { useState } from 'react';
import { useStore } from '../../store/useStore';
import type { Appointment } from '../../lib/schema';
import { materializeDay, type DoseView } from '../../lib/doses';
import { epochToDateKey, formatDayHeading, formatEpochTime, formatHHMM12 } from '../../lib/dates';
import { Dialog } from '../../components/ui/Dialog';
import { Button } from '../../components/ui/Button';
import { SectionLabel } from '../../components/ui/Card';
import { AppointmentDialog } from './AppointmentDialog';
import { CheckIcon, XIcon } from '../../components/icons';

function doseGlyph(v: DoseView) {
  if (v.status === 'taken') {
    return (
      <span
        className={`flex size-5 shrink-0 items-center justify-center rounded-full ${
          v.backfilled
            ? 'border-2 border-accent-strong text-accent-strong'
            : 'bg-accent-strong text-white'
        }`}
        title={v.backfilled ? 'Backfilled' : 'Taken'}
      >
        <CheckIcon className="size-3" />
      </span>
    );
  }
  if (v.status === 'skipped') {
    return (
      <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-surface-2 text-muted">
        <XIcon className="size-3" />
      </span>
    );
  }
  return (
    <span
      className={`size-5 shrink-0 rounded-full border-2 ${
        v.status === 'overdue' ? 'border-danger' : 'border-line'
      }`}
      title={v.status === 'overdue' ? 'No record' : 'Upcoming'}
    />
  );
}

function doseLine(v: DoseView): string {
  const bits: string[] = [];
  if (v.status === 'taken') {
    bits.push(v.takenAt !== null ? `taken ${formatEpochTime(v.takenAt)}` : 'taken');
    if (v.late) bits.push('late');
    if (v.backfilled) bits.push('backfilled');
  } else if (v.status === 'skipped') {
    bits.push('skipped');
    if (v.note) bits.push(v.note);
    if (v.backfilled) bits.push('backfilled');
  } else if (v.status === 'overdue') {
    bits.push('no record');
  } else {
    bits.push('upcoming');
  }
  return bits.join(' · ');
}

/** The full ledger for one day: every dose with status and actual time,
 * appointments with notes, PT sessions, pain score. */
export function DayDetail({
  dateKey,
  onClose,
}: {
  dateKey: string;
  onClose: () => void;
}) {
  const meds = useStore((s) => s.meds);
  const doses = useStore((s) => s.doses);
  const appointments = useStore((s) => s.appointments);
  const ptSessions = useStore((s) => s.ptSessions);
  const metrics = useStore((s) => s.metrics);
  const [editAppt, setEditAppt] = useState<{ id: string; appt: Appointment } | null>(null);

  const views = materializeDay(meds, doses[dateKey] ?? {}, dateKey, Date.now());
  const dayAppts = Object.entries(appointments)
    .filter(([, a]) => epochToDateKey(a.startAt) === dateKey)
    .sort(([, a], [, b]) => a.startAt - b.startAt);
  const daySessions = Object.entries(ptSessions)
    .filter(([, s]) => epochToDateKey(s.at) === dateKey)
    .sort(([, a], [, b]) => a.at - b.at);
  const metric = metrics[dateKey];

  return (
    <Dialog
      open
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
      title={formatDayHeading(dateKey)}
    >
      <div className="space-y-4">
        {dayAppts.length > 0 ? (
          <section className="space-y-1.5">
            <SectionLabel>Appointments</SectionLabel>
            {dayAppts.map(([id, a]) => (
              <button
                key={id}
                type="button"
                onClick={() => setEditAppt({ id, appt: a })}
                className="w-full rounded-(--radius-control) bg-surface-2 px-3 py-2 text-left text-sm transition hover:brightness-105"
              >
                <span className="flex items-baseline justify-between gap-2">
                  <span className="truncate font-medium">{a.title}</span>
                  <span className="shrink-0 text-xs text-muted">
                    {formatEpochTime(a.startAt)}
                  </span>
                </span>
                {a.location ? (
                  <span className="block text-xs text-muted">{a.location}</span>
                ) : null}
                {a.outcomeNotes ? (
                  <span className="mt-1 block text-xs">
                    <span className="font-semibold">Outcome: </span>
                    {a.outcomeNotes}
                  </span>
                ) : a.prepNotes ? (
                  <span className="mt-1 block text-xs">
                    <span className="font-semibold">Prep: </span>
                    {a.prepNotes}
                  </span>
                ) : null}
              </button>
            ))}
          </section>
        ) : null}

        <section className="space-y-1.5">
          <SectionLabel>Doses</SectionLabel>
          {views.length === 0 ? (
            <p className="text-sm text-muted">Nothing scheduled or logged.</p>
          ) : (
            <ul className="space-y-1">
              {views.map((v) => (
                <li key={v.doseId} className="flex items-center gap-2.5 text-sm">
                  {doseGlyph(v)}
                  <span className="min-w-0 flex-1 truncate">
                    {meds[v.medId]?.name ?? 'Unknown med'}
                    <span className="text-muted"> · {v.doseText}</span>
                  </span>
                  <span className="shrink-0 text-xs text-muted">
                    {v.slot ? `${formatHHMM12(v.slot)} — ` : ''}
                    {doseLine(v)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {daySessions.length > 0 ? (
          <section className="space-y-1.5">
            <SectionLabel>Physical therapy</SectionLabel>
            {daySessions.map(([id, s]) => (
              <div key={id} className="rounded-(--radius-control) bg-surface-2 px-3 py-2 text-sm">
                <span className="flex items-baseline justify-between">
                  <span className="font-medium capitalize">{s.kind} session</span>
                  <span className="text-xs text-muted">{formatEpochTime(s.at)}</span>
                </span>
                <span className="block text-xs text-muted">
                  {s.exercises.length} exercise{s.exercises.length === 1 ? '' : 's'}
                  {s.painPre !== null && s.painPost !== null
                    ? ` · pain ${s.painPre}→${s.painPost}`
                    : ''}
                  {s.source === 'hermes' ? ' · via Hermes' : ''}
                </span>
                {s.therapistNotes ? (
                  <span className="mt-1 block text-xs">{s.therapistNotes}</span>
                ) : null}
              </div>
            ))}
          </section>
        ) : null}

        {metric && (metric.pain !== null || metric.notes) ? (
          <section className="space-y-1">
            <SectionLabel>Day log</SectionLabel>
            <p className="text-sm">
              {metric.pain !== null ? `Pain ${metric.pain}/10` : ''}
              {metric.pain !== null && metric.notes ? ' · ' : ''}
              {metric.notes}
            </p>
          </section>
        ) : null}

        <Button variant="ghost" className="w-full" onClick={onClose}>
          Close
        </Button>
      </div>

      {editAppt ? (
        <AppointmentDialog
          key={editAppt.id}
          open
          onOpenChange={(o) => {
            if (!o) setEditAppt(null);
          }}
          apptId={editAppt.id}
          initial={editAppt.appt}
        />
      ) : null}
    </Dialog>
  );
}

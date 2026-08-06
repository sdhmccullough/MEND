import { useState } from 'react';
import type { Appointment, ApptKind } from '../../lib/schema';
import { deleteAppointment, saveAppointment } from '../../store/sync';
import { parseDateKey, toLocalDateKey, todayKey } from '../../lib/dates';
import { Dialog } from '../../components/ui/Dialog';
import { Button } from '../../components/ui/Button';
import { Chip } from '../../components/ui/Chip';
import { Field, TextInput, inputClass } from '../../components/ui/Field';
import { toast, toastError } from '../../components/ui/Toast';

const KIND_LABELS: Record<ApptKind, string> = {
  doctor: 'Doctor',
  pt: 'PT',
  imaging: 'Imaging',
  other: 'Other',
};

export function emptyAppointment(dateKey?: string): Appointment {
  const d = parseDateKey(dateKey ?? todayKey());
  d.setHours(9, 0, 0, 0);
  return {
    title: '',
    startAt: d.getTime(),
    endAt: null,
    kind: 'doctor',
    location: '',
    source: 'manual',
    gcalEventId: null,
    notes: '',
    prepNotes: '',
    outcomeNotes: '',
  };
}

function hhmm(ms: number): string {
  const d = new Date(ms);
  return (
    String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0')
  );
}

/** Create/edit an appointment. Google-sourced events keep their gcal-owned
 * fields (title/time/location) read-only — the app owns kind and notes. */
export function AppointmentDialog({
  open,
  onOpenChange,
  apptId,
  initial,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  apptId: string | null;
  initial: Appointment;
}) {
  const fromGcal = initial.source === 'gcal';
  const [title, setTitle] = useState(initial.title);
  const [date, setDate] = useState(toLocalDateKey(new Date(initial.startAt)));
  const [start, setStart] = useState(hhmm(initial.startAt));
  const [end, setEnd] = useState(initial.endAt !== null ? hhmm(initial.endAt) : '');
  const [kind, setKind] = useState<ApptKind>(initial.kind);
  const [location, setLocation] = useState(initial.location);
  const [prepNotes, setPrepNotes] = useState(initial.prepNotes);
  const [outcomeNotes, setOutcomeNotes] = useState(initial.outcomeNotes);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const epochAt = (hhmmStr: string): number => {
    const d = parseDateKey(date);
    const [h, m] = hhmmStr.split(':').map(Number);
    d.setHours(h, m, 0, 0);
    return d.getTime();
  };

  const submit = async () => {
    if (!title.trim() || !date || !start) {
      toastError('Missing details', 'Title, date, and start time are required.');
      return;
    }
    setSaving(true);
    try {
      const appt: Appointment = {
        ...initial,
        title: title.trim(),
        startAt: fromGcal ? initial.startAt : epochAt(start),
        endAt: fromGcal ? initial.endAt : end ? epochAt(end) : null,
        kind,
        location: location.trim(),
        prepNotes: prepNotes.trim(),
        outcomeNotes: outcomeNotes.trim(),
      };
      await saveAppointment(apptId, appt);
      onOpenChange(false);
      toast(apptId ? 'Appointment updated' : 'Appointment added', appt.title);
    } catch {
      toastError('Not synced', 'Try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={apptId ? 'Appointment' : 'Add appointment'}
      description={fromGcal ? 'Synced from Google Calendar — time and title live there.' : undefined}
    >
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <Field label="Title">
          <TextInput
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Follow-up — Dr. Reyes"
            disabled={fromGcal}
            required
          />
        </Field>
        <div className="grid grid-cols-3 gap-2">
          <Field label="Date">
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className={inputClass}
              disabled={fromGcal}
              required
            />
          </Field>
          <Field label="Start">
            <input
              type="time"
              value={start}
              onChange={(e) => setStart(e.target.value)}
              className={inputClass}
              disabled={fromGcal}
              required
            />
          </Field>
          <Field label="End" hint="Optional">
            <input
              type="time"
              value={end}
              onChange={(e) => setEnd(e.target.value)}
              className={inputClass}
              disabled={fromGcal}
            />
          </Field>
        </div>
        <Field label="Type">
          <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Appointment type">
            {(Object.keys(KIND_LABELS) as ApptKind[]).map((k) => (
              <Chip key={k} active={kind === k} onClick={() => setKind(k)}>
                {KIND_LABELS[k]}
              </Chip>
            ))}
          </div>
        </Field>
        <Field label="Location">
          <TextInput
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="Summit Physical Therapy"
            disabled={fromGcal}
          />
        </Field>
        <Field label="Prep notes" hint="Questions to ask, things to bring.">
          <textarea
            value={prepNotes}
            onChange={(e) => setPrepNotes(e.target.value)}
            rows={2}
            className={`${inputClass} resize-y`}
            placeholder="Ask about brace weaning…"
          />
        </Field>
        <Field label="Outcome notes" hint="What was said/decided — the connective tissue between visits.">
          <textarea
            value={outcomeNotes}
            onChange={(e) => setOutcomeNotes(e.target.value)}
            rows={2}
            className={`${inputClass} resize-y`}
            placeholder="Start weaning the brace next week…"
          />
        </Field>

        <div className="flex items-center justify-between gap-2 pt-1">
          {apptId && !fromGcal ? (
            confirmDelete ? (
              <Button
                variant="danger"
                onClick={() =>
                  deleteAppointment(apptId)
                    .then(() => {
                      onOpenChange(false);
                      toast('Appointment deleted');
                    })
                    .catch(() => toastError('Not synced'))
                }
              >
                Really delete?
              </Button>
            ) : (
              <Button variant="ghost" className="text-danger" onClick={() => setConfirmDelete(true)}>
                Delete
              </Button>
            )
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" disabled={saving}>
              {saving ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </div>
      </form>
    </Dialog>
  );
}

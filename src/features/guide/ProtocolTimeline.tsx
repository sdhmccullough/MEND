import { useState } from 'react';
import { useStore } from '../../store/useStore';
import type { ProtocolPhase } from '../../lib/schema';
import { deletePhase, savePhase } from '../../store/sync';
import { phaseViews } from '../../lib/protocol';
import { formatFull, parseDateKey } from '../../lib/dates';
import { Card, SectionLabel } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Dialog } from '../../components/ui/Dialog';
import { Field, TextInput, inputClass } from '../../components/ui/Field';
import { toast, toastError } from '../../components/ui/Toast';

/** The recovery arc as dated phases off the surgery date — what keeps the
 * app answering "what am I allowed to do" long after the prescriptions
 * run out. The phases are editable data: the care team's post-op sheet is
 * the authority, this just tracks where you are in it. */
export function ProtocolTimeline() {
  const protocol = useStore((s) => s.protocol);
  const injury = useStore((s) => s.injury);
  const [editor, setEditor] = useState<{
    id: string | null;
    initial: ProtocolPhase;
    key: number;
  } | null>(null);

  const views = phaseViews(protocol, injury.surgeryOn ?? '', Date.now());
  const nextStart = views.length
    ? Math.max(...views.map((v) => v.phase.endDay ?? v.phase.startDay)) + 1
    : 0;

  return (
    <Card>
      <SectionLabel>Recovery phases</SectionLabel>
      {!injury.surgeryOn ? (
        <p className="mt-1.5 text-xs text-muted">
          Set a surgery date in Settings → Injury to date these phases.
        </p>
      ) : null}

      {views.length > 0 ? (
        <ol className="mt-2 space-y-1.5">
          {views.map((v) => (
            <li key={v.id}>
              <button
                type="button"
                onClick={() => setEditor({ id: v.id, initial: v.phase, key: Date.now() })}
                className={`w-full rounded-(--radius-control) px-3 py-2 text-left transition ${
                  v.state === 'current'
                    ? 'bg-accent-soft ring-1 ring-accent-strong/30'
                    : v.state === 'past'
                      ? 'bg-surface-2 opacity-60'
                      : 'bg-surface-2'
                }`}
                aria-label={`Edit phase ${v.phase.label}`}
              >
                <span className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-sm font-medium">
                    {v.phase.label}
                    {v.state === 'current' ? (
                      <span className="text-accent-strong"> · now</span>
                    ) : null}
                    {v.state === 'past' ? <span className="text-muted"> · done</span> : null}
                  </span>
                  <span className="shrink-0 text-xs text-muted tabular-nums">
                    {v.phase.endDay === null
                      ? `day ${v.phase.startDay}+`
                      : `days ${v.phase.startDay}–${v.phase.endDay}`}
                  </span>
                </span>
                {v.startsOn ? (
                  <span className="block text-xs text-muted">
                    {formatFull(parseDateKey(v.startsOn))}
                    {v.endsOn ? ` – ${formatFull(parseDateKey(v.endsOn))}` : ' onward'}
                    {v.dayInPhase !== null && v.lengthDays !== null
                      ? ` · day ${v.dayInPhase} of ${v.lengthDays}`
                      : ''}
                  </span>
                ) : null}
                {v.phase.summary ? (
                  <span className="mt-1 block text-xs whitespace-pre-line">
                    {v.phase.summary}
                  </span>
                ) : null}
              </button>
            </li>
          ))}
        </ol>
      ) : (
        <p className="mt-1.5 text-sm text-muted">
          No phases yet. Add them from Dr. Ernat's post-op protocol sheet so
          the app can tell you where you are.
        </p>
      )}

      <Button
        variant="outline"
        className="mt-2 w-full"
        onClick={() =>
          setEditor({
            id: null,
            initial: {
              label: '',
              startDay: nextStart,
              endDay: null,
              summary: '',
              order: views.length,
            },
            key: Date.now(),
          })
        }
      >
        Add phase
      </Button>

      {editor ? (
        <PhaseEditor
          key={editor.key}
          phaseId={editor.id}
          initial={editor.initial}
          onClose={() => setEditor(null)}
        />
      ) : null}
    </Card>
  );
}

function PhaseEditor({
  phaseId,
  initial,
  onClose,
}: {
  phaseId: string | null;
  initial: ProtocolPhase;
  onClose: () => void;
}) {
  const [label, setLabel] = useState(initial.label);
  const [startDay, setStartDay] = useState(String(initial.startDay));
  const [endDay, setEndDay] = useState(initial.endDay === null ? '' : String(initial.endDay));
  const [summary, setSummary] = useState(initial.summary);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <Dialog
      open
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
      title={phaseId ? 'Edit phase' : 'New phase'}
      description="Days are counted from the surgery date (day 0)."
    >
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (!label.trim()) {
            toastError('Missing name', 'Give the phase a label.');
            return;
          }
          setSaving(true);
          savePhase(phaseId, {
            label: label.trim(),
            startDay: Math.max(0, Number(startDay) || 0),
            endDay: endDay === '' ? null : Math.max(0, Number(endDay) || 0),
            summary: summary.trim(),
            order: initial.order,
          })
            .then(() => {
              onClose();
              toast('Phase saved', label.trim());
            })
            .catch(() => toastError('Not synced', 'Try again.'))
            .finally(() => setSaving(false));
        }}
      >
        <Field label="Phase name">
          <TextInput
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Immobilization"
            required
          />
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Start day">
            <TextInput
              inputMode="numeric"
              value={startDay}
              onChange={(e) => setStartDay(e.target.value)}
            />
          </Field>
          <Field label="End day" hint="Empty = open-ended">
            <TextInput
              inputMode="numeric"
              value={endDay}
              onChange={(e) => setEndDay(e.target.value)}
            />
          </Field>
        </div>
        <Field label="What this phase allows / restricts">
          <textarea
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            rows={5}
            className={`${inputClass} resize-y`}
            placeholder="Sling full time including sleep. Elbow out 3× a day…"
          />
        </Field>
        <div className="flex items-center justify-between gap-2 pt-1">
          {phaseId ? (
            confirmDelete ? (
              <Button
                variant="danger"
                onClick={() =>
                  deletePhase(phaseId)
                    .then(() => {
                      onClose();
                      toast('Phase deleted');
                    })
                    .catch(() => toastError('Not synced'))
                }
              >
                Really delete?
              </Button>
            ) : (
              <Button
                variant="ghost"
                className="text-danger"
                onClick={() => setConfirmDelete(true)}
              >
                Delete
              </Button>
            )
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose}>
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

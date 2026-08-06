import { useState } from 'react';
import type { Med, ScheduleKind, TaperStep } from '../../lib/schema';
import { archiveMed, saveMed, unarchiveMed } from '../../store/sync';
import { todayKey } from '../../lib/dates';
import { Dialog } from '../../components/ui/Dialog';
import { Button, IconButton } from '../../components/ui/Button';
import { Field, TextInput, inputClass } from '../../components/ui/Field';
import { Chip } from '../../components/ui/Chip';
import { toast, toastError } from '../../components/ui/Toast';
import { PlusIcon, TrashIcon } from '../../components/icons';

export function emptyMed(): Med {
  return {
    name: '',
    doseText: '',
    form: '',
    purpose: '',
    prescriber: '',
    schedule: {
      kind: 'times',
      times: ['08:00'],
      everyHours: null,
      startOn: todayKey(),
      endOn: null,
      taper: [],
    },
    active: true,
    notes: '',
    refills: null,
    noDriving: false,
    variableDose: false,
    fillQuantity: null,
    filledOn: null,
  };
}

const KIND_LABELS: Record<ScheduleKind, string> = {
  times: 'Fixed times',
  interval: 'Every N hours',
  prn: 'As needed (PRN)',
};

/** Create/edit a medication. Mount with a fresh `key` per med so local
 * state re-initializes (the parent handles that). */
export function MedEditorDialog({
  open,
  onOpenChange,
  medId,
  initial,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  medId: string | null;
  initial: Med;
}) {
  const [name, setName] = useState(initial.name);
  const [doseText, setDoseText] = useState(initial.doseText);
  const [form, setForm] = useState(initial.form);
  const [purpose, setPurpose] = useState(initial.purpose);
  const [prescriber, setPrescriber] = useState(initial.prescriber);
  const [notes, setNotes] = useState(initial.notes);
  const [kind, setKind] = useState<ScheduleKind>(initial.schedule.kind);
  const [times, setTimes] = useState<string[]>(
    initial.schedule.times.length ? initial.schedule.times : ['08:00'],
  );
  const [everyHours, setEveryHours] = useState(
    initial.schedule.everyHours !== null ? String(initial.schedule.everyHours) : '6',
  );
  const [startOn, setStartOn] = useState(initial.schedule.startOn);
  const [endOn, setEndOn] = useState(initial.schedule.endOn ?? '');
  const [taper, setTaper] = useState<TaperStep[]>(initial.schedule.taper);
  const [noDriving, setNoDriving] = useState(initial.noDriving);
  const [variableDose, setVariableDose] = useState(initial.variableDose);
  const [fillQuantity, setFillQuantity] = useState(
    initial.fillQuantity !== null ? String(initial.fillQuantity) : '',
  );
  const [filledOn, setFilledOn] = useState(initial.filledOn ?? '');
  const [saving, setSaving] = useState(false);

  const setTime = (i: number, v: string) =>
    setTimes((t) => t.map((x, j) => (j === i ? v : x)));
  const setTaperField = (i: number, patch: Partial<TaperStep>) =>
    setTaper((t) => t.map((s, j) => (j === i ? { ...s, ...patch } : s)));

  const submit = async () => {
    const med: Med = {
      name: name.trim(),
      doseText: doseText.trim(),
      form: form.trim(),
      purpose: purpose.trim(),
      prescriber: prescriber.trim(),
      schedule: {
        kind,
        times: kind === 'times' ? [...new Set(times.filter(Boolean))].sort() : [],
        everyHours: kind === 'interval' ? Math.max(1, Number(everyHours) || 6) : null,
        startOn,
        endOn: endOn || null,
        taper: taper.filter((s) => s.from && s.doseText),
      },
      active: initial.active,
      notes: notes.trim(),
      refills: initial.refills,
      noDriving,
      variableDose,
      fillQuantity: fillQuantity === '' ? null : Math.max(0, Number(fillQuantity) || 0),
      filledOn: filledOn || null,
    };
    if (!med.name || (kind === 'times' && med.schedule.times.length === 0)) {
      toastError('Missing details', 'A name and at least one time are required.');
      return;
    }
    setSaving(true);
    try {
      await saveMed(medId, med);
      onOpenChange(false);
      toast(medId ? 'Med updated' : 'Med added', med.name);
    } catch {
      toastError('Not synced', 'Check your connection and try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={medId ? 'Edit medication' : 'Add medication'}
    >
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <Field label="Name">
          <TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="Naproxen" required />
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Dose">
            <TextInput value={doseText} onChange={(e) => setDoseText(e.target.value)} placeholder="500 mg" />
          </Field>
          <Field label="Form">
            <TextInput value={form} onChange={(e) => setForm(e.target.value)} placeholder="tablet" />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Purpose">
            <TextInput value={purpose} onChange={(e) => setPurpose(e.target.value)} placeholder="Anti-inflammatory" />
          </Field>
          <Field label="Prescriber">
            <TextInput value={prescriber} onChange={(e) => setPrescriber(e.target.value)} placeholder="Dr. Reyes" />
          </Field>
        </div>

        <Field label="Schedule">
          <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Schedule kind">
            {(Object.keys(KIND_LABELS) as ScheduleKind[]).map((k) => (
              <Chip key={k} active={kind === k} onClick={() => setKind(k)}>
                {KIND_LABELS[k]}
              </Chip>
            ))}
          </div>
        </Field>

        {kind === 'times' ? (
          <div className="space-y-1.5">
            {times.map((t, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  type="time"
                  value={t}
                  onChange={(e) => setTime(i, e.target.value)}
                  className={`${inputClass} flex-1`}
                  aria-label={`Dose time ${i + 1}`}
                />
                {times.length > 1 ? (
                  <IconButton
                    label={`Remove time ${i + 1}`}
                    className="!size-9 shrink-0"
                    onClick={() => setTimes((x) => x.filter((_, j) => j !== i))}
                  >
                    <TrashIcon className="size-4" />
                  </IconButton>
                ) : null}
              </div>
            ))}
            <Button variant="ghost" className="!min-h-9" onClick={() => setTimes((x) => [...x, '12:00'])}>
              <PlusIcon className="size-4" /> Add time
            </Button>
          </div>
        ) : null}

        {kind === 'interval' ? (
          <Field label="Every how many hours?">
            <TextInput
              inputMode="numeric"
              value={everyHours}
              onChange={(e) => setEveryHours(e.target.value)}
              placeholder="6"
            />
          </Field>
        ) : null}

        <div className="grid grid-cols-2 gap-2">
          <Field label="Start date">
            <TextInput type="date" value={startOn} onChange={(e) => setStartOn(e.target.value)} required />
          </Field>
          <Field label="End date" hint="Optional">
            <TextInput type="date" value={endOn} onChange={(e) => setEndOn(e.target.value)} />
          </Field>
        </div>

        <div className="space-y-1.5">
          <span className="block text-sm font-medium">
            Taper <span className="text-xs font-normal text-muted">(dose changes on dates)</span>
          </span>
          {taper.map((s, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <input
                type="date"
                value={s.from}
                onChange={(e) => setTaperField(i, { from: e.target.value })}
                className={`${inputClass} min-w-0 flex-1 !px-2 text-xs`}
                aria-label={`Taper step ${i + 1} start`}
              />
              <input
                type="date"
                value={s.to ?? ''}
                onChange={(e) => setTaperField(i, { to: e.target.value || null })}
                className={`${inputClass} min-w-0 flex-1 !px-2 text-xs`}
                aria-label={`Taper step ${i + 1} end (optional)`}
              />
              <input
                value={s.doseText}
                onChange={(e) => setTaperField(i, { doseText: e.target.value })}
                placeholder="250 mg"
                className={`${inputClass} w-20 !px-2 text-xs`}
                aria-label={`Taper step ${i + 1} dose`}
              />
              <IconButton
                label={`Remove taper step ${i + 1}`}
                className="!size-9 shrink-0"
                onClick={() => setTaper((x) => x.filter((_, j) => j !== i))}
              >
                <TrashIcon className="size-4" />
              </IconButton>
            </div>
          ))}
          <Button
            variant="ghost"
            className="!min-h-9"
            onClick={() => setTaper((x) => [...x, { from: '', to: null, doseText: '' }])}
          >
            <PlusIcon className="size-4" /> Add taper step
          </Button>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Field label="Quantity filled" hint="For the supply countdown">
            <TextInput
              inputMode="numeric"
              value={fillQuantity}
              onChange={(e) => setFillQuantity(e.target.value)}
              placeholder="20"
            />
          </Field>
          <Field label="Fill date">
            <TextInput
              type="date"
              value={filledOn}
              onChange={(e) => setFilledOn(e.target.value)}
            />
          </Field>
        </div>

        <div className="space-y-1.5">
          <label className="flex min-h-11 items-center gap-2.5 text-sm">
            <input
              type="checkbox"
              checked={noDriving}
              onChange={(e) => setNoDriving(e.target.checked)}
              className="size-4 accent-(--accent-strong)"
            />
            Narcotic — show a "no driving" notice after a dose
          </label>
          <label className="flex min-h-11 items-center gap-2.5 text-sm">
            <input
              type="checkbox"
              checked={variableDose}
              onChange={(e) => setVariableDose(e.target.checked)}
              className="size-4 accent-(--accent-strong)"
            />
            Variable dose (1–2) — ask how many when logging
          </label>
        </div>

        <Field label="Notes">
          <TextInput value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Take with food" />
        </Field>

        <div className="flex items-center justify-between gap-2 pt-1">
          {medId ? (
            initial.active ? (
              <Button
                variant="danger"
                onClick={() =>
                  archiveMed(medId)
                    .then(() => {
                      onOpenChange(false);
                      toast('Med archived', 'Past doses stay on the record.');
                    })
                    .catch(() => toastError('Not synced'))
                }
              >
                Archive
              </Button>
            ) : (
              <Button
                variant="outline"
                onClick={() =>
                  unarchiveMed(medId)
                    .then(() => {
                      onOpenChange(false);
                      toast('Med restored');
                    })
                    .catch(() => toastError('Not synced'))
                }
              >
                Unarchive
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

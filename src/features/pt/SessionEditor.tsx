import { useState } from 'react';
import { useStore } from '../../store/useStore';
import type { Exercise, PtSession } from '../../lib/schema';
import { deletePtSession, savePtSession } from '../../store/sync';
import { parseDateKey, toLocalDateKey, nowHHMM } from '../../lib/dates';
import { Dialog } from '../../components/ui/Dialog';
import { Button, IconButton } from '../../components/ui/Button';
import { Chip } from '../../components/ui/Chip';
import { Field, inputClass } from '../../components/ui/Field';
import { Slider } from '../../components/ui/Slider';
import { toast, toastError } from '../../components/ui/Toast';
import { PlusIcon, TrashIcon } from '../../components/icons';

export function emptySession(uid: string, exercises: Exercise[] = []): PtSession {
  return {
    at: Date.now(),
    kind: exercises.length ? 'home' : 'clinic',
    exercises,
    painPre: null,
    painPost: null,
    rom: {},
    therapistNotes: '',
    source: 'manual',
    by: uid,
  };
}

const blankExercise = (): Exercise => ({
  name: '',
  sets: 3,
  reps: 10,
  resistance: '',
  durationSec: 0,
});

/** Log a PT session fast enough for the parking lot: exercise names
 * auto-suggest from history + the home program, everything else has sane
 * defaults. */
export function SessionEditor({
  open,
  onOpenChange,
  sessionId,
  initial,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sessionId: string | null;
  initial: PtSession;
}) {
  const ptSessions = useStore((s) => s.ptSessions);
  const hep = useStore((s) => s.hep);

  const [kind, setKind] = useState<PtSession['kind']>(initial.kind);
  const [date, setDate] = useState(toLocalDateKey(new Date(initial.at)));
  const [time, setTime] = useState(nowHHMM(new Date(initial.at)));
  const [exercises, setExercises] = useState<Exercise[]>(
    initial.exercises.length ? initial.exercises : [blankExercise()],
  );
  const [painPre, setPainPre] = useState<number | null>(initial.painPre);
  const [painPost, setPainPost] = useState<number | null>(initial.painPost);
  const [romRows, setRomRows] = useState<Array<{ joint: string; degrees: string }>>(
    Object.entries(initial.rom).map(([joint, d]) => ({ joint, degrees: String(d) })),
  );
  const [therapistNotes, setTherapistNotes] = useState(initial.therapistNotes);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Auto-suggest: every exercise name ever logged + the home program.
  const knownExercises = [
    ...new Set([
      ...Object.values(ptSessions).flatMap((s) => s.exercises.map((e) => e.name)),
      ...hep.exercises.map((e) => e.name),
    ]),
  ]
    .filter(Boolean)
    .sort();

  const setExercise = (i: number, patch: Partial<Exercise>) =>
    setExercises((xs) => xs.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  const submit = async () => {
    const cleaned = exercises.filter((e) => e.name.trim());
    if (cleaned.length === 0) {
      toastError('No exercises', 'Add at least one exercise.');
      return;
    }
    const d = parseDateKey(date);
    const [h, m] = time.split(':').map(Number);
    d.setHours(h, m, 0, 0);
    const rom: Record<string, number> = {};
    for (const r of romRows) {
      const deg = Number(r.degrees);
      if (r.joint.trim() && Number.isFinite(deg)) rom[r.joint.trim()] = deg;
    }
    setSaving(true);
    try {
      await savePtSession(sessionId, {
        ...initial,
        at: d.getTime(),
        kind,
        exercises: cleaned.map((e) => ({ ...e, name: e.name.trim() })),
        painPre,
        painPost,
        rom,
        therapistNotes: therapistNotes.trim(),
      });
      onOpenChange(false);
      toast(sessionId ? 'Session updated' : 'Session logged', `${cleaned.length} exercises`);
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
      title={sessionId ? 'PT session' : 'Log PT session'}
    >
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <div className="flex gap-1.5" role="radiogroup" aria-label="Session kind">
          <Chip active={kind === 'clinic'} onClick={() => setKind('clinic')}>
            Clinic
          </Chip>
          <Chip active={kind === 'home'} onClick={() => setKind('home')}>
            Home
          </Chip>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Field label="Date">
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputClass} required />
          </Field>
          <Field label="Time">
            <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className={inputClass} required />
          </Field>
        </div>

        <div className="space-y-1.5">
          <span className="block text-sm font-medium">Exercises</span>
          <datalist id="exercise-names">
            {knownExercises.map((n) => (
              <option key={n} value={n} />
            ))}
          </datalist>
          {exercises.map((ex, i) => (
            <div key={i} className="space-y-1 rounded-(--radius-control) bg-surface-2 p-2">
              <div className="flex items-center gap-1.5">
                <input
                  value={ex.name}
                  onChange={(e) => setExercise(i, { name: e.target.value })}
                  list="exercise-names"
                  placeholder="Exercise name"
                  className={`${inputClass} min-w-0 flex-1`}
                  aria-label={`Exercise ${i + 1} name`}
                />
                <IconButton
                  label={`Remove exercise ${i + 1}`}
                  className="!size-9 shrink-0"
                  onClick={() => setExercises((xs) => xs.filter((_, j) => j !== i))}
                >
                  <TrashIcon className="size-4" />
                </IconButton>
              </div>
              <div className="grid grid-cols-4 gap-1.5">
                <input
                  inputMode="numeric"
                  value={ex.sets || ''}
                  onChange={(e) => setExercise(i, { sets: Number(e.target.value) || 0 })}
                  placeholder="Sets"
                  className={`${inputClass} !min-h-9 !px-2 text-xs`}
                  aria-label={`Exercise ${i + 1} sets`}
                />
                <input
                  inputMode="numeric"
                  value={ex.reps || ''}
                  onChange={(e) => setExercise(i, { reps: Number(e.target.value) || 0 })}
                  placeholder="Reps"
                  className={`${inputClass} !min-h-9 !px-2 text-xs`}
                  aria-label={`Exercise ${i + 1} reps`}
                />
                <input
                  value={ex.resistance}
                  onChange={(e) => setExercise(i, { resistance: e.target.value })}
                  placeholder="Band/lbs"
                  className={`${inputClass} !min-h-9 !px-2 text-xs`}
                  aria-label={`Exercise ${i + 1} resistance`}
                />
                <input
                  inputMode="numeric"
                  value={ex.durationSec ? String(Math.round(ex.durationSec / 60)) : ''}
                  onChange={(e) =>
                    setExercise(i, { durationSec: (Number(e.target.value) || 0) * 60 })
                  }
                  placeholder="Min"
                  className={`${inputClass} !min-h-9 !px-2 text-xs`}
                  aria-label={`Exercise ${i + 1} minutes`}
                />
              </div>
            </div>
          ))}
          <Button variant="ghost" className="!min-h-9" onClick={() => setExercises((xs) => [...xs, blankExercise()])}>
            <PlusIcon className="size-4" /> Add exercise
          </Button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <span className="mb-1 block text-sm font-medium">
              Pain before {painPre !== null ? `· ${painPre}` : ''}
            </span>
            <Slider
              value={painPre ?? 0}
              onValueChange={(v) => setPainPre(v)}
              label="Pain before session"
            />
          </div>
          <div>
            <span className="mb-1 block text-sm font-medium">
              Pain after {painPost !== null ? `· ${painPost}` : ''}
            </span>
            <Slider
              value={painPost ?? 0}
              onValueChange={(v) => setPainPost(v)}
              label="Pain after session"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <span className="block text-sm font-medium">
            Range of motion <span className="text-xs font-normal text-muted">(optional)</span>
          </span>
          {romRows.map((r, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <input
                value={r.joint}
                onChange={(e) =>
                  setRomRows((rows) => rows.map((x, j) => (j === i ? { ...x, joint: e.target.value } : x)))
                }
                placeholder="knee flexion"
                className={`${inputClass} min-w-0 flex-1`}
                aria-label={`ROM ${i + 1} joint`}
              />
              <input
                inputMode="numeric"
                value={r.degrees}
                onChange={(e) =>
                  setRomRows((rows) => rows.map((x, j) => (j === i ? { ...x, degrees: e.target.value } : x)))
                }
                placeholder="120°"
                className={`${inputClass} w-20`}
                aria-label={`ROM ${i + 1} degrees`}
              />
              <IconButton
                label={`Remove ROM ${i + 1}`}
                className="!size-9 shrink-0"
                onClick={() => setRomRows((rows) => rows.filter((_, j) => j !== i))}
              >
                <TrashIcon className="size-4" />
              </IconButton>
            </div>
          ))}
          <Button
            variant="ghost"
            className="!min-h-9"
            onClick={() => setRomRows((rows) => [...rows, { joint: '', degrees: '' }])}
          >
            <PlusIcon className="size-4" /> Add measurement
          </Button>
        </div>

        <Field label="Therapist notes">
          <textarea
            value={therapistNotes}
            onChange={(e) => setTherapistNotes(e.target.value)}
            rows={2}
            className={`${inputClass} resize-y`}
            placeholder="Cleared to add mini squats next week…"
          />
        </Field>

        <div className="flex items-center justify-between gap-2 pt-1">
          {sessionId ? (
            confirmDelete ? (
              <Button
                variant="danger"
                onClick={() =>
                  deletePtSession(sessionId)
                    .then(() => {
                      onOpenChange(false);
                      toast('Session deleted');
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
              {saving ? 'Saving…' : 'Save session'}
            </Button>
          </div>
        </div>
      </form>
    </Dialog>
  );
}

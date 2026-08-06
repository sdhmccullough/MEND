import { useState } from 'react';
import { useStore } from '../../store/useStore';
import type { Exercise } from '../../lib/schema';
import { saveHep } from '../../store/sync';
import { Dialog } from '../../components/ui/Dialog';
import { Button, IconButton } from '../../components/ui/Button';
import { inputClass } from '../../components/ui/Field';
import { toast, toastError } from '../../components/ui/Toast';
import { PlusIcon, TrashIcon } from '../../components/icons';

const blank = (): Exercise => ({ name: '', sets: 3, reps: 10, resistance: '', durationSec: 0 });

/** The prescribed home exercise program; "Start home session" prefills a
 * session from this list. */
export function HepEditorDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const hep = useStore((s) => s.hep);
  const [rows, setRows] = useState<Exercise[]>(hep.exercises.length ? hep.exercises : [blank()]);
  const [saving, setSaving] = useState(false);

  const setRow = (i: number, patch: Partial<Exercise>) =>
    setRows((xs) => xs.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Home exercise program"
      description="The list your PT prescribed. Starting a home session prefills these."
    >
      <div className="space-y-1.5">
        {rows.map((ex, i) => (
          <div key={i} className="flex items-center gap-1.5">
            <input
              value={ex.name}
              onChange={(e) => setRow(i, { name: e.target.value })}
              placeholder="Exercise"
              className={`${inputClass} min-w-0 flex-1`}
              aria-label={`HEP exercise ${i + 1}`}
            />
            <input
              inputMode="numeric"
              value={ex.sets || ''}
              onChange={(e) => setRow(i, { sets: Number(e.target.value) || 0 })}
              placeholder="Sets"
              className={`${inputClass} w-14 !px-2 text-xs`}
              aria-label={`HEP exercise ${i + 1} sets`}
            />
            <input
              inputMode="numeric"
              value={ex.reps || ''}
              onChange={(e) => setRow(i, { reps: Number(e.target.value) || 0 })}
              placeholder="Reps"
              className={`${inputClass} w-14 !px-2 text-xs`}
              aria-label={`HEP exercise ${i + 1} reps`}
            />
            <IconButton
              label={`Remove HEP exercise ${i + 1}`}
              className="!size-9 shrink-0"
              onClick={() => setRows((xs) => xs.filter((_, j) => j !== i))}
            >
              <TrashIcon className="size-4" />
            </IconButton>
          </div>
        ))}
        <Button variant="ghost" className="!min-h-9" onClick={() => setRows((xs) => [...xs, blank()])}>
          <PlusIcon className="size-4" /> Add exercise
        </Button>
        <Button
          variant="primary"
          className="w-full"
          disabled={saving}
          onClick={() => {
            setSaving(true);
            saveHep(rows.filter((r) => r.name.trim()).map((r) => ({ ...r, name: r.name.trim() })))
              .then(() => {
                onOpenChange(false);
                toast('Home program saved');
              })
              .catch(() => toastError('Not synced', 'Try again.'))
              .finally(() => setSaving(false));
          }}
        >
          {saving ? 'Saving…' : 'Save program'}
        </Button>
      </div>
    </Dialog>
  );
}

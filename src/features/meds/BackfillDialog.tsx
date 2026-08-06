import { useMemo, useState } from 'react';
import { useStore } from '../../store/useStore';
import { commitBackfill } from '../../store/sync';
import { buildBackfillUpdates, type BackfillSelection } from '../../lib/backfill';
import { scheduledDoseId } from '../../lib/doses';
import { addDays, dateKeyRange, formatDayHeading, formatHHMM12, todayKey } from '../../lib/dates';
import { Dialog } from '../../components/ui/Dialog';
import { Button } from '../../components/ui/Button';
import { Field, Select } from '../../components/ui/Field';
import { toast, toastError } from '../../components/ui/Toast';

type CellState = 'taken' | 'skipped' | undefined;
const CYCLE: Record<string, CellState> = {
  none: 'taken',
  taken: 'skipped',
  skipped: undefined,
};

/** Bulk-enter the pre-app period: pick a med, paint taken/skipped across a
 * date × slot grid, commit as ONE atomic write. Records carry
 * backfilled: true and render hollow everywhere — reconstructed history
 * stays distinguishable from the live record. */
export function BackfillDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const meds = useStore((s) => s.meds);
  const doses = useStore((s) => s.doses);
  const injury = useStore((s) => s.injury);
  const user = useStore((s) => s.user);

  const eligible = Object.entries(meds).filter(([, m]) => m.schedule.kind === 'times');
  const [medId, setMedId] = useState<string>(eligible[0]?.[0] ?? '');
  const [cells, setCells] = useState<Record<string, CellState>>({});
  const [saving, setSaving] = useState(false);

  const med = medId ? meds[medId] : undefined;
  const yesterday = addDays(todayKey(), -1);

  const range = useMemo(() => {
    if (!med) return [];
    const from = med.schedule.startOn || injury.occurredOn || addDays(todayKey(), -30);
    if (from > yesterday) return [];
    return dateKeyRange(from, yesterday);
  }, [med, injury.occurredOn, yesterday]);

  const keyOf = (dateKey: string, slot: string) => `${dateKey}|${slot}`;
  const existing = (dateKey: string, slot: string) =>
    medId ? doses[dateKey]?.[scheduledDoseId(medId, slot)] : undefined;

  const cycle = (dateKey: string, slot: string) =>
    setCells((c) => {
      const k = keyOf(dateKey, slot);
      return { ...c, [k]: CYCLE[c[k] ?? 'none'] };
    });

  const paintAll = (state: CellState) => {
    if (!med) return;
    const next: Record<string, CellState> = {};
    for (const dateKey of range) {
      for (const slot of med.schedule.times) {
        if (!existing(dateKey, slot)) next[keyOf(dateKey, slot)] = state;
      }
    }
    setCells(next);
  };

  const selections: BackfillSelection[] = useMemo(() => {
    if (!med) return [];
    const out: BackfillSelection[] = [];
    for (const dateKey of range) {
      for (const slot of med.schedule.times) {
        const state = cells[keyOf(dateKey, slot)];
        if (state && !existing(dateKey, slot)) out.push({ dateKey, slot, status: state });
      }
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [med, range, cells, doses]);

  const commit = async () => {
    if (!user || !medId || selections.length === 0) return;
    setSaving(true);
    try {
      await commitBackfill(buildBackfillUpdates(medId, selections, user.uid));
      toast('History backfilled', `${selections.length} doses recorded for ${med?.name}.`);
      setCells({});
      onOpenChange(false);
    } catch {
      toastError('Not synced', 'Nothing was saved — try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Backfill history"
      description="Tap cells to cycle blank → taken → skipped. Backfilled entries are permanent and render hollow, so reconstructed history stays honest."
    >
      {eligible.length === 0 ? (
        <p className="text-sm text-muted">
          Backfill works on meds with fixed times. Add one on the Meds tab first.
        </p>
      ) : (
        <div className="space-y-3">
          <Field label="Medication">
            <Select
              value={medId}
              onChange={(e) => {
                setMedId(e.target.value);
                setCells({});
              }}
            >
              {eligible.map(([id, m]) => (
                <option key={id} value={id}>
                  {m.name} — {m.doseText}
                </option>
              ))}
            </Select>
          </Field>

          {med && range.length > 0 ? (
            <>
              <div className="flex gap-2">
                <Button variant="outline" className="!min-h-9 flex-1" onClick={() => paintAll('taken')}>
                  All taken
                </Button>
                <Button variant="ghost" className="!min-h-9" onClick={() => setCells({})}>
                  Clear
                </Button>
              </div>

              <div className="max-h-72 space-y-1 overflow-y-auto pr-1">
                {range.map((dateKey) => (
                  <div key={dateKey} className="flex items-center gap-2">
                    <span className="w-24 shrink-0 text-xs text-muted">
                      {formatDayHeading(dateKey)}
                    </span>
                    <div className="flex flex-1 gap-1.5">
                      {med.schedule.times.map((slot) => {
                        const locked = existing(dateKey, slot);
                        const state = locked
                          ? locked.status === 'skipped'
                            ? 'skipped'
                            : 'taken'
                          : cells[keyOf(dateKey, slot)];
                        return (
                          <button
                            key={slot}
                            type="button"
                            disabled={Boolean(locked)}
                            onClick={() => cycle(dateKey, slot)}
                            aria-label={`${formatDayHeading(dateKey)} ${formatHHMM12(slot)}: ${state ?? 'blank'}${locked ? ' (already recorded)' : ''}`}
                            className={`min-h-9 flex-1 rounded-(--radius-control) border text-xs font-medium transition ${
                              state === 'taken'
                                ? locked
                                  ? 'border-accent-strong/40 bg-accent-soft/60 text-accent-strong opacity-60'
                                  : 'border-accent-strong bg-accent-soft text-accent-strong'
                                : state === 'skipped'
                                  ? 'border-line bg-surface-2 text-muted line-through'
                                  : 'border-line bg-surface text-muted'
                            }`}
                          >
                            {formatHHMM12(slot)}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>

              <Button
                variant="primary"
                className="w-full"
                disabled={selections.length === 0 || saving}
                onClick={() => void commit()}
              >
                {saving
                  ? 'Saving…'
                  : selections.length > 0
                    ? `Save ${selections.length} backfilled ${selections.length === 1 ? 'dose' : 'doses'}`
                    : 'Nothing selected yet'}
              </Button>
            </>
          ) : (
            <p className="text-sm text-muted">
              No days to backfill — the schedule starts today or later.
            </p>
          )}
        </div>
      )}
    </Dialog>
  );
}

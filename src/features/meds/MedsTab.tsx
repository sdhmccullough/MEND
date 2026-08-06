import { useState } from 'react';
import { useStore } from '../../store/useStore';
import type { DoseRecord, Med } from '../../lib/schema';
import { doseTextForDate } from '../../lib/doses';
import { medSupply } from '../../lib/supply';
import { formatHHMM12, todayKey } from '../../lib/dates';
import { Card, SectionLabel } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { MedEditorDialog, emptyMed } from './MedEditorDialog';
import { BackfillDialog } from './BackfillDialog';

function scheduleSummary(med: Med): string {
  const s = med.schedule;
  if (s.kind === 'prn') return 'As needed';
  if (s.kind === 'interval') return `Every ${s.everyHours ?? '?'} hours`;
  return s.times.map(formatHHMM12).join(' · ');
}

function MedRow({
  med,
  medId,
  doses,
  onEdit,
}: {
  med: Med;
  medId: string;
  doses: Record<string, Record<string, DoseRecord>>;
  onEdit: () => void;
}) {
  const today = todayKey();
  const currentDose = doseTextForDate(med, today);
  const tapering = currentDose !== med.doseText;
  const supply = medSupply(med, medId, doses, Date.now());
  return (
    <button
      type="button"
      onClick={onEdit}
      className="w-full rounded-(--radius-control) bg-surface-2 px-3 py-2.5 text-left transition hover:brightness-105 active:scale-[0.99]"
    >
      <span className="flex items-baseline justify-between gap-2">
        <span className="truncate text-sm font-medium">{med.name}</span>
        <span className="shrink-0 text-xs text-muted">{scheduleSummary(med)}</span>
      </span>
      <span className="mt-0.5 block text-xs text-muted">
        {currentDose}
        {tapering ? ' (tapering)' : ''}
        {med.purpose ? ` · ${med.purpose}` : ''}
      </span>
      {supply ? (
        <span
          className={`mt-1 block text-xs ${supply.low ? 'font-medium text-warn' : 'text-muted'}`}
        >
          ≈{supply.remaining} of {supply.filled} left
          {supply.daysLeft !== null ? ` · ~${supply.daysLeft} days` : ''}
          {supply.low ? ' · running low' : ''}
        </span>
      ) : null}
    </button>
  );
}

export function MedsTab() {
  const meds = useStore((s) => s.meds);
  const doses = useStore((s) => s.doses);
  const [editor, setEditor] = useState<{ medId: string | null; key: number } | null>(null);
  const [backfillOpen, setBackfillOpen] = useState(false);

  const entries = Object.entries(meds);
  const active = entries.filter(([, m]) => m.active);
  const archived = entries.filter(([, m]) => !m.active);

  const openEditor = (medId: string | null) =>
    setEditor({ medId, key: Date.now() });

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <Button variant="primary" className="flex-1" onClick={() => openEditor(null)}>
          Add medication
        </Button>
        <Button variant="outline" onClick={() => setBackfillOpen(true)}>
          Backfill history
        </Button>
      </div>

      <Card>
        <SectionLabel>Active</SectionLabel>
        {active.length === 0 ? (
          <p className="mt-1.5 text-sm text-muted">
            No active meds. Add the current list, then backfill the days
            before the app existed.
          </p>
        ) : (
          <ul className="mt-2 space-y-1.5">
            {active.map(([id, med]) => (
              <li key={id}>
                <MedRow
                  med={med}
                  medId={id}
                  doses={doses}
                  onEdit={() => openEditor(id)}
                />
              </li>
            ))}
          </ul>
        )}
      </Card>

      {archived.length > 0 ? (
        <Card>
          <SectionLabel>Archived</SectionLabel>
          <ul className="mt-2 space-y-1.5 opacity-70">
            {archived.map(([id, med]) => (
              <li key={id}>
                <MedRow
                  med={med}
                  medId={id}
                  doses={doses}
                  onEdit={() => openEditor(id)}
                />
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {editor ? (
        <MedEditorDialog
          key={editor.key}
          open
          onOpenChange={(o) => {
            if (!o) setEditor(null);
          }}
          medId={editor.medId}
          initial={editor.medId ? meds[editor.medId] : emptyMed()}
        />
      ) : null}

      <BackfillDialog open={backfillOpen} onOpenChange={setBackfillOpen} />
    </div>
  );
}

import { useStore } from '../../store/useStore';
import { Card, SectionLabel } from '../../components/ui/Card';

// M0 placeholder: lists meds read-only. The editor, schedules, dose
// generation, and backfill land in M1.
export function MedsTab() {
  const meds = useStore((s) => s.meds);
  const entries = Object.entries(meds);

  return (
    <div className="space-y-3">
      <Card>
        <SectionLabel>Medications</SectionLabel>
        {entries.length === 0 ? (
          <p className="mt-1.5 text-sm text-muted">
            No meds yet. Adding, scheduling, and the backfill flow arrive with
            the next milestone.
          </p>
        ) : (
          <ul className="mt-2 space-y-1.5">
            {entries.map(([id, med]) => (
              <li
                key={id}
                className="rounded-(--radius-control) bg-surface-2 px-3 py-2 text-sm"
              >
                <span className="font-medium">{med.name}</span>
                <span className="text-muted"> · {med.doseText}</span>
                {!med.active ? <span className="text-xs text-muted"> (archived)</span> : null}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

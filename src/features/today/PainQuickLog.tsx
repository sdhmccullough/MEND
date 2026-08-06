import { useEffect, useState } from 'react';
import { useStore } from '../../store/useStore';
import { saveMetric } from '../../store/sync';
import { todayKey } from '../../lib/dates';
import { Card, SectionLabel } from '../../components/ui/Card';
import { Slider } from '../../components/ui/Slider';
import { toastError } from '../../components/ui/Toast';

// One pain score per day, editable all day. Slider commit = save.
export function PainQuickLog() {
  const today = todayKey();
  const metric = useStore((s) => s.metrics[today]);
  const saved = metric?.pain ?? null;
  const [value, setValue] = useState<number>(saved ?? 0);
  const [touched, setTouched] = useState(saved !== null);

  // Follow remote edits (the other spouse may have logged it).
  useEffect(() => {
    if (saved !== null) {
      setValue(saved);
      setTouched(true);
    }
  }, [saved]);

  return (
    <Card>
      <div className="flex items-baseline justify-between">
        <SectionLabel>Pain today</SectionLabel>
        <span className="text-lg font-bold tabular-nums">
          {touched ? value : '–'}
          <span className="text-xs font-normal text-muted"> / 10</span>
        </span>
      </div>
      <div className="mt-2">
        <Slider
          value={value}
          onValueChange={(v) => {
            setValue(v);
            setTouched(true);
          }}
          label="Pain today, 0 to 10"
        />
      </div>
      <div className="mt-1 flex justify-between text-xs text-muted">
        <span>No pain</span>
        <span>Worst</span>
      </div>
      {touched && value !== saved ? (
        <button
          type="button"
          className="mt-2 w-full rounded-(--radius-control) bg-accent-strong py-2 text-sm font-semibold text-white transition active:scale-[0.98]"
          onClick={() =>
            saveMetric(today, { pain: value }).catch(() =>
              toastError('Not synced', 'Try again.'),
            )
          }
        >
          Save pain {value}/10
        </button>
      ) : null}
    </Card>
  );
}

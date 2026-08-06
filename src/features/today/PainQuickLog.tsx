import { useEffect, useState } from 'react';
import { useStore } from '../../store/useStore';
import { saveMetric } from '../../store/sync';
import { addDays, todayKey } from '../../lib/dates';
import { Card, SectionLabel } from '../../components/ui/Card';
import { Slider } from '../../components/ui/Slider';
import { toast, toastError } from '../../components/ui/Toast';

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
          className="mt-2 min-h-11 w-full rounded-(--radius-control) bg-accent-strong text-sm font-semibold text-white transition active:scale-[0.98]"
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

const SANE_PROMPT_DAYS = 7;

/** SANE: "shoulder as a percentage of normal" — the outcome measure the
 * care team recorded pre-op (60). Weekly is plenty; the card hides itself
 * between check-ins. */
export function SaneQuickLog() {
  const metrics = useStore((s) => s.metrics);
  const today = todayKey();
  const [value, setValue] = useState(60);
  const [open, setOpen] = useState(false);

  const scored = Object.entries(metrics)
    .filter(([, m]) => m.sane !== null)
    .sort(([a], [b]) => b.localeCompare(a));
  const [lastKey, lastMetric] = scored[0] ?? [null, null];
  const due = lastKey === null || lastKey <= addDays(today, -SANE_PROMPT_DAYS);

  if (!due && !open) {
    return (
      <Card>
        <div className="flex items-baseline justify-between gap-2">
          <SectionLabel>Shoulder rating (SANE)</SectionLabel>
          <button
            type="button"
            className="text-xs text-muted underline-offset-2 hover:underline"
            onClick={() => {
              setValue(lastMetric?.sane ?? 60);
              setOpen(true);
            }}
          >
            update
          </button>
        </div>
        <p className="mt-1 text-sm">
          <span className="text-lg font-bold tabular-nums">{lastMetric?.sane}%</span>
          <span className="text-xs text-muted"> of normal · logged {lastKey}</span>
        </p>
      </Card>
    );
  }

  return (
    <Card>
      <div className="flex items-baseline justify-between">
        <SectionLabel>Shoulder rating (SANE)</SectionLabel>
        <span className="text-lg font-bold tabular-nums">{value}%</span>
      </div>
      <p className="mt-0.5 text-xs text-muted">
        If a normal shoulder is 100%, what percentage is yours today? Your
        surgeon recorded 60% before surgery.
      </p>
      <div className="mt-2">
        <Slider
          value={value}
          onValueChange={setValue}
          min={0}
          max={100}
          step={5}
          label="Shoulder rating, 0 to 100 percent of normal"
        />
      </div>
      <button
        type="button"
        className="mt-2 min-h-11 w-full rounded-(--radius-control) bg-accent-strong text-sm font-semibold text-white transition active:scale-[0.98]"
        onClick={() =>
          saveMetric(today, { sane: value })
            .then(() => {
              setOpen(false);
              toast('Shoulder rating saved', `${value}% of normal`);
            })
            .catch(() => toastError('Not synced', 'Try again.'))
        }
      >
        Save {value}%
      </button>
    </Card>
  );
}

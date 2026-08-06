import { Suspense, lazy } from 'react';
import { useStore } from '../../store/useStore';
import { StatTile } from '../../components/ui/StatTile';
import { currentStreak, rangeAdherence } from '../../lib/adherence';
import { daysSinceInjury, weekStartOf } from '../../lib/progress';
import { addDays, epochToDateKey, todayKey } from '../../lib/dates';

const ChartsPanel = lazy(() => import('./ChartsPanel'));

export function ProgressTab() {
  const meds = useStore((s) => s.meds);
  const doses = useStore((s) => s.doses);
  const ptSessions = useStore((s) => s.ptSessions);
  const injury = useStore((s) => s.injury);

  const now = Date.now();
  const today = todayKey();
  const adherence7 = rangeAdherence(meds, doses, addDays(today, -6), today, now);
  const adherence30 = rangeAdherence(meds, doses, addDays(today, -29), today, now);
  const streak = currentStreak(meds, doses, now);
  const thisWeek = weekStartOf(today);
  const sessionsThisWeek = Object.values(ptSessions).filter(
    (s) => weekStartOf(epochToDateKey(s.at)) === thisWeek,
  ).length;
  const dayN = daysSinceInjury(injury.occurredOn, now);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <StatTile
          label="Adherence · 7d"
          value={adherence7.pct !== null ? `${adherence7.pct}%` : '–'}
          sub={adherence30.pct !== null ? `${adherence30.pct}% over 30 days` : undefined}
        />
        <StatTile
          label="Streak"
          value={streak}
          sub={streak === 1 ? 'day fully taken' : 'days fully taken'}
        />
        <StatTile label="PT this week" value={sessionsThisWeek} sub="sessions logged" />
        <StatTile
          label="Recovery day"
          value={dayN !== null ? dayN : '–'}
          sub={injury.title || 'set the injury profile'}
        />
      </div>

      <Suspense
        fallback={<div className="h-44 animate-pulse rounded-(--radius-card) bg-surface-2" />}
      >
        <ChartsPanel />
      </Suspense>
    </div>
  );
}

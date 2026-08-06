import { useStore } from '../../store/useStore';
import { lastNarcoticDose } from '../../lib/supply';
import { currentPhase, phaseViews, postOpDay } from '../../lib/protocol';
import { sinceLabel } from '../../lib/routines';
import { Card } from '../../components/ui/Card';

/** Where you are in the protocol, plus the narcotic clock. Deliberately
 * reports elapsed time and the discharge instruction — it never tells you
 * that you're clear to drive. That call belongs to the care team. */
export function StatusCard() {
  const injury = useStore((s) => s.injury);
  const protocol = useStore((s) => s.protocol);
  const meds = useStore((s) => s.meds);
  const doses = useStore((s) => s.doses);

  const now = Date.now();
  const day = postOpDay(injury.surgeryOn ?? '', now);
  const phase = currentPhase(phaseViews(protocol, injury.surgeryOn ?? '', now));
  const narcotic = lastNarcoticDose(meds, doses, now);
  const recentNarcotic = narcotic !== null && narcotic.minutesSince < 24 * 60;

  if (day === null && !phase && !recentNarcotic) return null;

  return (
    <Card>
      {phase ? (
        <div>
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-sm font-semibold">{phase.phase.label}</span>
            <span className="text-xs text-muted tabular-nums">
              {day !== null ? `post-op day ${day}` : ''}
            </span>
          </div>
          {phase.dayInPhase !== null && phase.lengthDays !== null ? (
            <>
              <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
                <div
                  className="h-full rounded-full bg-accent-strong"
                  style={{
                    width: `${Math.min(100, (phase.dayInPhase / phase.lengthDays) * 100)}%`,
                  }}
                />
              </div>
              <p className="mt-1 text-xs text-muted">
                Day {phase.dayInPhase} of {phase.lengthDays}
                {phase.endsOn ? ` · through ${phase.endsOn}` : ''}
              </p>
            </>
          ) : null}
          {phase.phase.summary ? (
            <p className="mt-1.5 text-xs whitespace-pre-line">{phase.phase.summary}</p>
          ) : null}
        </div>
      ) : day !== null ? (
        <p className="text-sm">
          <span className="font-semibold">Post-op day {day}</span>
          <span className="block text-xs text-muted">
            Add recovery phases in the Guide tab to track the protocol.
          </span>
        </p>
      ) : null}

      {recentNarcotic && narcotic ? (
        <div className="mt-2 rounded-(--radius-control) border border-warn/30 bg-surface-2 p-2">
          <p className="text-xs">
            <span className="font-semibold text-warn">
              {narcotic.medName} {sinceLabel(narcotic.minutesSince)}
            </span>
            <span className="block text-muted">
              Discharge instruction: no driving or important decisions while
              taking narcotics.
            </span>
          </p>
        </div>
      ) : null}
    </Card>
  );
}

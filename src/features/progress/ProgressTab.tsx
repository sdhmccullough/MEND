import { useStore } from '../../store/useStore';
import { Card, SectionLabel } from '../../components/ui/Card';
import { StatTile } from '../../components/ui/StatTile';

// M0 placeholder: shows the pain log count so the screen isn't dead.
// Recharts panels (pain trend, ROM, adherence, milestones) land in M4.
export function ProgressTab() {
  const metrics = useStore((s) => s.metrics);
  const ptSessions = useStore((s) => s.ptSessions);
  const painDays = Object.values(metrics).filter((m) => m.pain !== null).length;
  const sessionCount = Object.keys(ptSessions).length;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <StatTile label="Pain logs" value={painDays} sub="days recorded" />
        <StatTile label="PT sessions" value={sessionCount} sub="logged" />
      </div>
      <Card>
        <SectionLabel>Progress charts</SectionLabel>
        <p className="mt-1.5 text-sm text-muted">
          Pain trend, ROM per joint, and adherence charts arrive in an
          upcoming milestone.
        </p>
      </Card>
    </div>
  );
}

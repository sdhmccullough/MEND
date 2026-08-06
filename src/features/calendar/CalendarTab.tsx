import { Card, SectionLabel } from '../../components/ui/Card';

// M0 placeholder. Month grid with adherence dots + day-detail ledger land
// in M2; Google Calendar sync in M3.
export function CalendarTab() {
  return (
    <div className="space-y-3">
      <Card>
        <SectionLabel>Calendar</SectionLabel>
        <p className="mt-1.5 text-sm text-muted">
          The month view with med-adherence dots and the day-by-day ledger
          arrive in an upcoming milestone.
        </p>
      </Card>
    </div>
  );
}

import { useStore } from '../../store/useStore';
import { Card, SectionLabel } from '../../components/ui/Card';
import { formatEpochTime, formatFull } from '../../lib/dates';
import { DoseChecklist } from '../meds/DoseChecklist';
import { InboxCards } from '../inbox/InboxCards';
import { PtCard } from '../pt/PtCard';
import { PainQuickLog, SaneQuickLog } from './PainQuickLog';
import { ActiveTimers } from './ActiveTimers';
import { RoutineChips } from './RoutineChips';
import { StatusCard } from './StatusCard';

const KIND_LABELS: Record<string, string> = {
  doctor: 'Doctor',
  pt: 'PT',
  imaging: 'Imaging',
  other: 'Appointment',
};

function NextAppointment() {
  const appointments = useStore((s) => s.appointments);
  const upcoming = Object.values(appointments)
    .filter((a) => a.startAt > Date.now())
    .sort((a, b) => a.startAt - b.startAt)[0];

  return (
    <Card>
      <SectionLabel>Next appointment</SectionLabel>
      {upcoming ? (
        <div className="mt-1.5">
          <span className="block text-sm font-semibold">{upcoming.title}</span>
          <span className="block text-xs text-muted">
            {KIND_LABELS[upcoming.kind]} · {formatFull(new Date(upcoming.startAt))} at{' '}
            {formatEpochTime(upcoming.startAt)}
            {upcoming.location ? ` · ${upcoming.location}` : ''}
          </span>
          {upcoming.prepNotes ? (
            <p className="mt-1.5 rounded-(--radius-control) bg-surface-2 p-2 text-xs">
              <span className="font-semibold">Prep: </span>
              {upcoming.prepNotes}
            </p>
          ) : null}
        </div>
      ) : (
        <p className="mt-1.5 text-sm text-muted">Nothing scheduled.</p>
      )}
    </Card>
  );
}

export function TodayTab() {
  return (
    <div className="space-y-3">
      <ActiveTimers />

      <InboxCards />

      <StatusCard />

      <NextAppointment />

      <DoseChecklist />

      <RoutineChips />

      <PtCard />

      <PainQuickLog />

      <SaneQuickLog />
    </div>
  );
}

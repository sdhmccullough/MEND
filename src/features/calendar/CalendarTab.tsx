import { useState } from 'react';
import { useStore } from '../../store/useStore';
import type { ApptKind } from '../../lib/schema';
import { dayAdherence, dayDotColor, type DotColor } from '../../lib/adherence';
import { epochToDateKey, monthGrid, monthLabel, parseDateKey, todayKey } from '../../lib/dates';
import { Card } from '../../components/ui/Card';
import { Button, IconButton } from '../../components/ui/Button';
import { ChevronLeftIcon, ChevronRightIcon } from '../../components/icons';
import { DayDetail } from './DayDetail';
import { AppointmentDialog, emptyAppointment } from './AppointmentDialog';

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

const APPT_DOT: Record<ApptKind, string> = {
  doctor: 'bg-danger',
  pt: 'bg-accent',
  imaging: 'bg-warn',
  other: 'bg-muted',
};

const ADHERENCE_BAR: Record<Exclude<DotColor, 'none'>, string> = {
  green: 'bg-accent',
  amber: 'bg-warn',
  red: 'bg-danger',
  hollow: 'border border-accent bg-transparent',
};

export function CalendarTab() {
  const meds = useStore((s) => s.meds);
  const doses = useStore((s) => s.doses);
  const appointments = useStore((s) => s.appointments);

  const today = todayKey();
  const t = parseDateKey(today);
  const [view, setView] = useState({ year: t.getFullYear(), month0: t.getMonth() });
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const cells = monthGrid(view.year, view.month0);
  const now = Date.now();

  // Appointment dots per day (kinds present, max 3 shown).
  const apptKindsByDay = new Map<string, ApptKind[]>();
  for (const a of Object.values(appointments)) {
    const key = epochToDateKey(a.startAt);
    const kinds = apptKindsByDay.get(key) ?? [];
    if (!kinds.includes(a.kind)) kinds.push(a.kind);
    apptKindsByDay.set(key, kinds);
  }

  const shift = (delta: number) => {
    const d = new Date(view.year, view.month0 + delta, 1);
    setView({ year: d.getFullYear(), month0: d.getMonth() });
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1">
          <IconButton label="Previous month" onClick={() => shift(-1)}>
            <ChevronLeftIcon className="size-5" />
          </IconButton>
          <button
            type="button"
            className="min-w-36 text-center text-sm font-bold"
            onClick={() => setView({ year: t.getFullYear(), month0: t.getMonth() })}
            title="Jump to current month"
          >
            {monthLabel(view.year, view.month0)}
          </button>
          <IconButton label="Next month" onClick={() => shift(1)}>
            <ChevronRightIcon className="size-5" />
          </IconButton>
        </div>
        <Button variant="outline" className="!min-h-9" onClick={() => setAdding(true)}>
          Add appointment
        </Button>
      </div>

      <Card className="p-2">
        <div className="grid grid-cols-7 text-center">
          {WEEKDAYS.map((d, i) => (
            <span key={i} className="py-1 text-xs font-semibold text-muted">
              {d}
            </span>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-0.5">
          {cells.map((cell) => {
            const dot = dayDotColor(dayAdherence(meds, doses[cell.dateKey], cell.dateKey, now));
            const kinds = apptKindsByDay.get(cell.dateKey) ?? [];
            const isToday = cell.dateKey === today;
            const isFuture = cell.dateKey > today;
            return (
              <button
                key={cell.dateKey}
                type="button"
                onClick={() => setSelectedDay(cell.dateKey)}
                aria-label={`${cell.dateKey}${kinds.length ? `, ${kinds.length} appointment kinds` : ''}${dot !== 'none' ? `, meds ${dot === 'hollow' ? 'backfilled' : dot}` : ''}`}
                className={`flex min-h-12 flex-col items-center justify-between rounded-md py-1 transition hover:bg-surface-2 ${
                  cell.inMonth ? '' : 'opacity-35'
                } ${isToday ? 'bg-accent-soft' : ''}`}
              >
                <span className="flex h-3 items-center gap-0.5">
                  {kinds.slice(0, 3).map((k) => (
                    <span key={k} className={`size-1.5 rounded-full ${APPT_DOT[k]}`} />
                  ))}
                </span>
                <span
                  className={`text-xs tabular-nums ${isToday ? 'font-bold text-accent-strong' : ''}`}
                >
                  {Number(cell.dateKey.slice(8))}
                </span>
                <span className="flex h-1.5 w-6 items-center justify-center">
                  {dot !== 'none' && !isFuture ? (
                    <span className={`h-1 w-5 rounded-full ${ADHERENCE_BAR[dot]}`} />
                  ) : null}
                </span>
              </button>
            );
          })}
        </div>
      </Card>

      <Card className="p-3">
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
          <span className="flex items-center gap-1.5">
            <span className="size-1.5 rounded-full bg-danger" /> Doctor
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-1.5 rounded-full bg-accent" /> PT
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-1.5 rounded-full bg-warn" /> Imaging
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-1 w-4 rounded-full bg-accent" /> Meds taken
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-1 w-4 rounded-full border border-accent" /> Backfilled
          </span>
        </div>
      </Card>

      {selectedDay ? (
        <DayDetail dateKey={selectedDay} onClose={() => setSelectedDay(null)} />
      ) : null}

      {adding ? (
        <AppointmentDialog
          open
          onOpenChange={(o) => {
            if (!o) setAdding(false);
          }}
          apptId={null}
          initial={emptyAppointment(selectedDay ?? undefined)}
        />
      ) : null}
    </div>
  );
}

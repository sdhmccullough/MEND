import { useStore } from '../../store/useStore';
import { doseTextForDate } from '../../lib/doses';
import { currentStreak, rangeAdherence } from '../../lib/adherence';
import { daysSinceInjury, weekStartOf } from '../../lib/progress';
import { currentPhase, phaseViews, postOpDay } from '../../lib/protocol';
import {
  addDays,
  epochToDateKey,
  formatEpochTime,
  formatFull,
  formatHHMM12,
  parseDateKey,
  todayKey,
} from '../../lib/dates';
import type { Med } from '../../lib/schema';

function scheduleLine(med: Med): string {
  const s = med.schedule;
  if (s.kind === 'prn') return 'As needed';
  if (s.kind === 'interval') return `Every ${s.everyHours ?? '?'} h`;
  return s.times.map(formatHHMM12).join(', ');
}

/** Date-ranged summary to hand a provider. Rendered as the ONLY thing on
 * screen (App swaps the whole tree), so window.print() → save as PDF gives
 * a clean document. Deliberately black-on-white regardless of theme. */
export function ProviderReport({ onClose }: { onClose: () => void }) {
  const injury = useStore((s) => s.injury);
  const meds = useStore((s) => s.meds);
  const doses = useStore((s) => s.doses);
  const metrics = useStore((s) => s.metrics);
  const ptSessions = useStore((s) => s.ptSessions);
  const appointments = useStore((s) => s.appointments);
  const protocol = useStore((s) => s.protocol);
  const user = useStore((s) => s.user);

  const now = Date.now();
  const today = todayKey();
  const from = injury.occurredOn || addDays(today, -30);
  const dayN = daysSinceInjury(injury.occurredOn, now);

  const medEntries = Object.entries(meds);
  const overall = rangeAdherence(meds, doses, from, today, now);
  const streak = currentStreak(meds, doses, now);

  // Weekly average pain from the daily quick-log.
  const weekly = new Map<string, number[]>();
  for (const [dateKey, m] of Object.entries(metrics)) {
    if (m.pain === null || dateKey < from || dateKey > today) continue;
    const wk = weekStartOf(dateKey);
    weekly.set(wk, [...(weekly.get(wk) ?? []), m.pain]);
  }
  const painWeeks = [...weekly.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([wk, vals]) => ({
      wk,
      avg: (vals.reduce((s, v) => s + v, 0) / vals.length).toFixed(1),
      n: vals.length,
    }));

  const saneScores = Object.entries(metrics)
    .filter(([dateKey, m]) => m.sane !== null && dateKey >= from && dateKey <= today)
    .sort(([a], [b]) => a.localeCompare(b));

  const opDay = postOpDay(injury.surgeryOn ?? '', now);
  const phase = currentPhase(phaseViews(protocol, injury.surgeryOn ?? '', now));

  const sessions = Object.values(ptSessions)
    .filter((s) => {
      const key = epochToDateKey(s.at);
      return key >= from && key <= today;
    })
    .sort((a, b) => a.at - b.at);

  const appts = Object.values(appointments).sort((a, b) => a.startAt - b.startAt);

  return (
    <main className="min-h-dvh bg-white p-6 text-sm text-black print:p-0">
      <div className="mx-auto max-w-2xl space-y-5">
        <div className="flex items-center justify-between gap-2 print:hidden">
          <button
            type="button"
            onClick={onClose}
            className="rounded border border-gray-300 px-4 py-2 font-semibold"
          >
            ← Back to Mend
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="rounded bg-teal-700 px-4 py-2 font-semibold text-white"
          >
            Print / Save as PDF
          </button>
        </div>

        <header className="border-b-2 border-black pb-2">
          <h1 className="text-xl font-bold">Recovery summary — {injury.title || 'Injury'}</h1>
          <p className="text-xs text-gray-600">
            {user?.email} · Generated {formatFull(new Date(now))} · Covers{' '}
            {formatFull(parseDateKey(from))} – {formatFull(parseDateKey(today))}
            {dayN !== null ? ` · Recovery day ${dayN}` : ''}
          </p>
          <p className="mt-1 text-xs text-gray-600">
            Self-tracked record from the Mend app. Hollow/backfilled entries are
            reconstructed history; all others were logged live.
          </p>
        </header>

        <section>
          <h2 className="mb-1 font-bold uppercase tracking-wide">Injury</h2>
          <p>
            {injury.occurredOn ? `Injured ${formatFull(parseDateKey(injury.occurredOn))}` : ''}
            {injury.mechanism ? ` — ${injury.mechanism}.` : ''}{' '}
            {injury.diagnosis ? `${injury.diagnosis}.` : ''}
            {injury.surgeryOn ? ` Surgery ${formatFull(parseDateKey(injury.surgeryOn))}.` : ''}
          </p>
          {Object.values(injury.providers).length > 0 ? (
            <p className="text-xs text-gray-600">
              Care team: {Object.values(injury.providers).join(' · ')}
            </p>
          ) : null}
          {opDay !== null ? (
            <p className="text-xs">
              <span className="font-semibold">Post-op day {opDay}</span>
              {phase
                ? ` · ${phase.phase.label}${phase.dayInPhase !== null && phase.lengthDays !== null ? ` (day ${phase.dayInPhase} of ${phase.lengthDays})` : ''}`
                : ''}
            </p>
          ) : null}
        </section>

        {saneScores.length > 0 ? (
          <section>
            <h2 className="mb-1 font-bold uppercase tracking-wide">
              SANE (shoulder as % of normal)
            </h2>
            <p className="text-xs">
              {saneScores
                .map(([dateKey, m]) => `${formatFull(parseDateKey(dateKey))}: ${m.sane}%`)
                .join(' · ')}
            </p>
          </section>
        ) : null}

        <section>
          <h2 className="mb-1 font-bold uppercase tracking-wide">Medications</h2>
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="border-b border-gray-400 text-left">
                <th className="py-1 pr-2">Medication</th>
                <th className="py-1 pr-2">Dose</th>
                <th className="py-1 pr-2">Schedule</th>
                <th className="py-1 pr-2">Adherence*</th>
                <th className="py-1">Status</th>
              </tr>
            </thead>
            <tbody>
              {medEntries.map(([id, med]) => {
                const a = rangeAdherence({ [id]: med }, doses, from, today, now);
                return (
                  <tr key={id} className="border-b border-gray-200 align-top">
                    <td className="py-1 pr-2 font-semibold">{med.name}</td>
                    <td className="py-1 pr-2">{doseTextForDate(med, today)}</td>
                    <td className="py-1 pr-2">{scheduleLine(med)}</td>
                    <td className="py-1 pr-2">
                      {a.pct !== null ? `${a.pct}% (${a.taken}/${a.due})` : '—'}
                    </td>
                    <td className="py-1">{med.active ? 'Active' : 'Stopped'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="mt-1 text-[10px] text-gray-500">
            *Scheduled doses only; as-needed meds have no denominator. Overall:{' '}
            {overall.pct !== null ? `${overall.pct}% (${overall.taken}/${overall.due})` : '—'}
            {streak > 0 ? ` · current full-day streak: ${streak}` : ''}
          </p>
          <ul className="mt-1 space-y-0.5 text-[10px] text-gray-600">
            {medEntries
              .filter(([, m]) => m.notes)
              .map(([id, m]) => (
                <li key={id}>
                  <span className="font-semibold">{m.name}:</span> {m.notes}
                </li>
              ))}
          </ul>
        </section>

        {painWeeks.length > 0 ? (
          <section>
            <h2 className="mb-1 font-bold uppercase tracking-wide">Pain (weekly average, 0–10)</h2>
            <table className="w-full border-collapse text-xs">
              <tbody>
                {painWeeks.map((w) => (
                  <tr key={w.wk} className="border-b border-gray-200">
                    <td className="py-1 pr-2">Week of {formatFull(parseDateKey(w.wk))}</td>
                    <td className="py-1 pr-2 font-semibold">{w.avg}</td>
                    <td className="py-1 text-gray-500">{w.n} day{w.n === 1 ? '' : 's'} logged</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ) : null}

        {sessions.length > 0 ? (
          <section>
            <h2 className="mb-1 font-bold uppercase tracking-wide">Physical therapy</h2>
            <ul className="space-y-1 text-xs">
              {sessions.map((s, i) => (
                <li key={i} className="border-b border-gray-200 pb-1">
                  <span className="font-semibold">
                    {formatFull(new Date(s.at))} — {s.kind}
                  </span>
                  {' · '}
                  {s.exercises.map((e) => e.name).join(', ')}
                  {s.painPre !== null && s.painPost !== null
                    ? ` · pain ${s.painPre}→${s.painPost}`
                    : ''}
                  {Object.entries(s.rom).length > 0
                    ? ` · ROM: ${Object.entries(s.rom)
                        .map(([j, d]) => `${j} ${d}°`)
                        .join(', ')}`
                    : ''}
                  {s.therapistNotes ? ` — ${s.therapistNotes}` : ''}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {appts.length > 0 ? (
          <section>
            <h2 className="mb-1 font-bold uppercase tracking-wide">Appointments</h2>
            <ul className="space-y-1 text-xs">
              {appts.map((a, i) => (
                <li key={i} className="border-b border-gray-200 pb-1">
                  <span className="font-semibold">
                    {formatFull(new Date(a.startAt))} {formatEpochTime(a.startAt)}
                  </span>
                  {' — '}
                  {a.title}
                  {a.location ? ` (${a.location})` : ''}
                  {a.outcomeNotes ? (
                    <span className="block text-gray-600">Outcome: {a.outcomeNotes}</span>
                  ) : null}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <footer className="border-t border-gray-300 pt-2 text-[10px] text-gray-500">
          Personal record-keeping only — not a medical document. Dose times are
          local. Generated by Mend.
        </footer>
      </div>
    </main>
  );
}

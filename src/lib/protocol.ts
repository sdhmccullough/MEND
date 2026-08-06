// Recovery phases relative to the surgery date. This is what keeps the
// app useful after the prescriptions run out: "where am I in the protocol
// and what does this phase allow?"
//
// The phases are user-editable data, not clinical knowledge baked into the
// app — the care team's post-op sheet is authoritative.

import type { ProtocolPhase } from './schema';
import { addDays, parseDateKey, toLocalDateKey } from './dates';

export interface PhaseView {
  id: string;
  phase: ProtocolPhase;
  startsOn: string; // dateKey
  endsOn: string | null;
  state: 'past' | 'current' | 'future';
  /** 1-based day within the phase, when current. */
  dayInPhase: number | null;
  lengthDays: number | null;
}

/** Whole days since surgery (day 0 = surgery day). */
export function postOpDay(surgeryOn: string, now: number): number | null {
  if (!surgeryOn) return null;
  const today = parseDateKey(toLocalDateKey(new Date(now))).getTime();
  const surgery = parseDateKey(surgeryOn).getTime();
  return Math.max(0, Math.round((today - surgery) / 86_400_000));
}

export function phaseViews(
  phases: Record<string, ProtocolPhase>,
  surgeryOn: string,
  now: number,
): PhaseView[] {
  const day = postOpDay(surgeryOn, now);
  return Object.entries(phases)
    .sort(([, a], [, b]) => a.startDay - b.startDay || a.order - b.order)
    .map(([id, phase]) => {
      const startsOn = surgeryOn ? addDays(surgeryOn, phase.startDay) : '';
      const endsOn =
        surgeryOn && phase.endDay !== null ? addDays(surgeryOn, phase.endDay) : null;
      let state: PhaseView['state'] = 'future';
      let dayInPhase: number | null = null;
      if (day !== null) {
        const ended = phase.endDay !== null && day > phase.endDay;
        const started = day >= phase.startDay;
        if (ended) state = 'past';
        else if (started) {
          state = 'current';
          dayInPhase = day - phase.startDay + 1;
        }
      }
      return {
        id,
        phase,
        startsOn,
        endsOn,
        state,
        dayInPhase,
        lengthDays: phase.endDay !== null ? phase.endDay - phase.startDay + 1 : null,
      };
    });
}

export function currentPhase(views: PhaseView[]): PhaseView | null {
  return views.find((v) => v.state === 'current') ?? null;
}

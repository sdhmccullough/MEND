import { describe, expect, it } from 'vitest';
import { currentPhase, phaseViews, postOpDay } from '../src/lib/protocol';
import type { ProtocolPhase } from '../src/lib/schema';

const SURGERY = '2026-08-05';
const NOW = new Date(2026, 7, 12, 9, 0).getTime(); // Aug 12 → post-op day 7

function phase(overrides: Partial<ProtocolPhase> = {}): ProtocolPhase {
  return { label: 'Phase', startDay: 0, endDay: null, summary: '', order: 0, ...overrides };
}

const PHASES = {
  p1: phase({ label: 'Immobilization', startDay: 0, endDay: 41, order: 0 }),
  p2: phase({ label: 'Motion', startDay: 42, endDay: 83, order: 1 }),
  p3: phase({ label: 'Strengthening', startDay: 84, endDay: null, order: 2 }),
};

describe('postOpDay', () => {
  it('counts whole days from surgery, day 0 = surgery day', () => {
    expect(postOpDay(SURGERY, new Date(2026, 7, 5, 23, 0).getTime())).toBe(0);
    expect(postOpDay(SURGERY, NOW)).toBe(7);
  });

  it('is null without a surgery date and never negative', () => {
    expect(postOpDay('', NOW)).toBeNull();
    expect(postOpDay('2026-09-01', NOW)).toBe(0);
  });
});

describe('phaseViews', () => {
  it('dates phases off the surgery date and marks the current one', () => {
    const views = phaseViews(PHASES, SURGERY, NOW);
    expect(views.map((v) => v.state)).toEqual(['current', 'future', 'future']);
    expect(views[0].startsOn).toBe('2026-08-05');
    expect(views[0].endsOn).toBe('2026-09-15');
    expect(views[0].dayInPhase).toBe(8); // day 7 is the 8th day of phase 1
    expect(views[0].lengthDays).toBe(42);
  });

  it('marks elapsed phases past', () => {
    const later = new Date(2026, 9, 1, 9, 0).getTime(); // ~day 57
    const views = phaseViews(PHASES, SURGERY, later);
    expect(views.map((v) => v.state)).toEqual(['past', 'current', 'future']);
    expect(currentPhase(views)?.phase.label).toBe('Motion');
  });

  it('open-ended final phase stays current forever', () => {
    const wayLater = new Date(2027, 5, 1).getTime();
    expect(currentPhase(phaseViews(PHASES, SURGERY, wayLater))?.phase.label).toBe(
      'Strengthening',
    );
  });

  it('sorts by start day regardless of insertion order', () => {
    const scrambled = { z: PHASES.p3, a: PHASES.p2, m: PHASES.p1 };
    expect(phaseViews(scrambled, SURGERY, NOW).map((v) => v.phase.label)).toEqual([
      'Immobilization',
      'Motion',
      'Strengthening',
    ]);
  });

  it('without a surgery date there is no current phase', () => {
    const views = phaseViews(PHASES, '', NOW);
    expect(currentPhase(views)).toBeNull();
    expect(views[0].startsOn).toBe('');
  });
});

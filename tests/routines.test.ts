import { describe, expect, it } from 'vitest';
import {
  countdownLabel,
  effectiveCadence,
  routineStatuses,
  secondsLeft,
  sinceLabel,
} from '../src/lib/routines';
import type { Routine, RoutineLog } from '../src/lib/schema';

const NOW = new Date(2026, 7, 7, 14, 0).getTime();
const minutesAgo = (n: number) => NOW - n * 60_000;

function routine(overrides: Partial<Routine> = {}): Routine {
  return {
    label: 'Ice',
    targetPerDay: 8,
    everyMinutes: 90,
    timerMinutes: 30,
    active: true,
    order: 1,
    ...overrides,
  };
}
function log(routineId: string, at: number): RoutineLog {
  return { routineId, at, by: 'u1' };
}

describe('routineStatuses', () => {
  it('counts today only and finds the latest rep', () => {
    const [s] = routineStatuses(
      { ice: routine() },
      { a: log('ice', minutesAgo(200)), b: log('ice', minutesAgo(30)), c: log('other', NOW) },
      NOW,
    );
    expect(s.doneToday).toBe(2);
    expect(s.minutesSince).toBe(30);
  });

  it('is due when the cadence has elapsed and the target is unmet', () => {
    const notYet = routineStatuses({ ice: routine() }, { a: log('ice', minutesAgo(30)) }, NOW);
    expect(notYet[0].due).toBe(false);
    const elapsed = routineStatuses({ ice: routine() }, { a: log('ice', minutesAgo(120)) }, NOW);
    expect(elapsed[0].due).toBe(true);
  });

  it('is due when never done today', () => {
    expect(routineStatuses({ ice: routine() }, {}, NOW)[0].due).toBe(true);
    expect(routineStatuses({ ice: routine() }, undefined, NOW)[0].minutesSince).toBeNull();
  });

  it('stops being due once the daily target is met', () => {
    const logs = Object.fromEntries(
      Array.from({ length: 8 }, (_, i) => [`l${i}`, log('ice', minutesAgo(300 + i))]),
    );
    const [s] = routineStatuses({ ice: routine() }, logs, NOW);
    expect(s.complete).toBe(true);
    expect(s.due).toBe(false);
  });

  it('a routine with a target but no stated cadence settles after a rep', () => {
    // 3× a day over a 16h waking day → due again after ~5h20m. Without
    // this the tile stayed lit the instant after logging, so the tap
    // looked like it had done nothing.
    const elbow = { elbow: routine({ label: 'Elbow', targetPerDay: 3, everyMinutes: 0 }) };
    const justTapped = routineStatuses(elbow, { a: log('elbow', minutesAgo(5)) }, NOW)[0];
    expect(justTapped.due).toBe(false);
    expect(justTapped.minutesUntilDue).toBe(315);

    const later = routineStatuses(elbow, { a: log('elbow', minutesAgo(330)) }, NOW)[0];
    expect(later.due).toBe(true);
    expect(later.minutesUntilDue).toBeNull();
  });

  it('a once-a-day routine has no cadence and stays due until done', () => {
    const once = { x: routine({ targetPerDay: 1, everyMinutes: 0 }) };
    expect(routineStatuses(once, { a: log('x', minutesAgo(5)) }, NOW)[0].complete).toBe(true);
    expect(routineStatuses(once, {}, NOW)[0].due).toBe(true);
  });

  it('hides inactive routines and sorts by order', () => {
    const list = routineStatuses(
      {
        b: routine({ label: 'B', order: 2 }),
        a: routine({ label: 'A', order: 1 }),
        gone: routine({ label: 'Gone', active: false }),
      },
      {},
      NOW,
    );
    expect(list.map((s) => s.routine.label)).toEqual(['A', 'B']);
  });
});

describe('effectiveCadence', () => {
  it('prefers a stated cadence, otherwise spreads the target over the day', () => {
    expect(effectiveCadence(routine({ everyMinutes: 90, targetPerDay: 8 }))).toBe(90);
    expect(effectiveCadence(routine({ everyMinutes: 0, targetPerDay: 3 }))).toBe(320);
    expect(effectiveCadence(routine({ everyMinutes: 0, targetPerDay: 1 }))).toBe(0);
  });
});

describe('countdown', () => {
  it('counts seconds down and goes negative once elapsed', () => {
    expect(secondsLeft(undefined, NOW)).toBeNull();
    expect(secondsLeft(NOW + 90_000, NOW)).toBe(90);
    expect(secondsLeft(NOW - 30_000, NOW)).toBe(-30);
  });

  it('formats mm:ss and floors at zero', () => {
    expect(countdownLabel(1471)).toBe('24:31');
    expect(countdownLabel(60)).toBe('1:00');
    expect(countdownLabel(5)).toBe('0:05');
    expect(countdownLabel(-42)).toBe('0:00');
  });
});

describe('sinceLabel', () => {
  it('formats elapsed time', () => {
    expect(sinceLabel(null)).toBe('not yet today');
    expect(sinceLabel(0)).toBe('just now');
    expect(sinceLabel(47)).toBe('47m ago');
    expect(sinceLabel(120)).toBe('2h ago');
    expect(sinceLabel(130)).toBe('2h 10m ago');
  });
});

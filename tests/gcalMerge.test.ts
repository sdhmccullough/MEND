import { describe, expect, it } from 'vitest';
import {
  eventMatches,
  gcalApptId,
  guessKind,
  mergeGcalEvents,
  parseGcalEvent,
} from '../src/lib/gcalMerge';
import type { Appointment, GcalSettings } from '../src/lib/schema';
import { DEFAULT_GCAL } from '../src/lib/schema';

const GCAL: GcalSettings = { ...DEFAULT_GCAL, keywords: ['PT', 'Dr.', 'MRI'] };

const WINDOW_START = Date.parse('2026-08-01T00:00:00');
const WINDOW_END = Date.parse('2026-11-01T00:00:00');

function rawEvent(overrides: Record<string, unknown> = {}) {
  return {
    id: 'ev1',
    summary: 'PT with Sam',
    location: 'Summit PT',
    start: { dateTime: '2026-08-10T15:00:00-06:00' },
    end: { dateTime: '2026-08-10T15:45:00-06:00' },
    ...overrides,
  };
}

function gcalAppt(overrides: Partial<Appointment> = {}): Appointment {
  return {
    title: 'PT with Sam',
    startAt: Date.parse('2026-08-10T15:00:00-06:00'),
    endAt: Date.parse('2026-08-10T15:45:00-06:00'),
    kind: 'pt',
    location: 'Summit PT',
    source: 'gcal',
    gcalEventId: 'ev1',
    notes: '',
    prepNotes: '',
    outcomeNotes: '',
    ...overrides,
  };
}

describe('parseGcalEvent', () => {
  it('parses timed events to epoch ms', () => {
    const ev = parseGcalEvent(rawEvent());
    expect(ev).toMatchObject({
      eventId: 'ev1',
      title: 'PT with Sam',
      allDay: false,
    });
    expect(ev?.endAt).not.toBeNull();
  });

  it('parses all-day events at local midnight with no end', () => {
    const ev = parseGcalEvent(
      rawEvent({ start: { date: '2026-08-10' }, end: { date: '2026-08-11' } }),
    );
    expect(ev?.allDay).toBe(true);
    expect(ev?.endAt).toBeNull();
    expect(new Date(ev!.startAt).getHours()).toBe(0);
  });

  it('drops cancelled and unparseable events', () => {
    expect(parseGcalEvent(rawEvent({ status: 'cancelled' }))).toBeNull();
    expect(parseGcalEvent(rawEvent({ start: undefined }))).toBeNull();
  });
});

describe('eventMatches / guessKind', () => {
  it('matches keywords case-insensitively', () => {
    const ev = parseGcalEvent(rawEvent({ summary: 'pt with sam' }))!;
    expect(eventMatches(ev, GCAL)).toBe(true);
    const work = parseGcalEvent(rawEvent({ summary: 'Sprint planning' }))!;
    expect(eventMatches(work, GCAL)).toBe(false);
  });

  it('per-event overrides beat keywords', () => {
    const work = parseGcalEvent(rawEvent({ id: 'w1', summary: 'Sprint planning' }))!;
    expect(eventMatches(work, { ...GCAL, includeEventIds: { w1: true } })).toBe(true);
    const pt = parseGcalEvent(rawEvent())!;
    expect(eventMatches(pt, { ...GCAL, excludeEventIds: { ev1: true } })).toBe(false);
  });

  it('guesses kinds from titles', () => {
    expect(guessKind('PT with Sam')).toBe('pt');
    expect(guessKind('Knee MRI')).toBe('imaging');
    expect(guessKind('Dr. Reyes follow up')).toBe('doctor');
    expect(guessKind('Insurance call')).toBe('other');
  });

  it('sanitizes ids for RTDB paths', () => {
    expect(gcalApptId('a.b#c$d[e]f/g')).toBe('gcal_a-b-c-d-e-f-g');
  });
});

describe('mergeGcalEvents', () => {
  it('creates new appointments with guessed kind', () => {
    const updates = mergeGcalEvents({}, [rawEvent()], WINDOW_START, WINDOW_END, GCAL);
    const appt = updates['appointments/gcal_ev1'] as Appointment;
    expect(appt).toMatchObject({ source: 'gcal', kind: 'pt', gcalEventId: 'ev1' });
  });

  it('updates only changed gcal-owned fields, preserving app-owned ones', () => {
    const existing = {
      gcal_ev1: gcalAppt({ kind: 'other', prepNotes: 'ask about brace' }),
    };
    const moved = rawEvent({
      start: { dateTime: '2026-08-11T09:00:00-06:00' },
      end: { dateTime: '2026-08-11T09:45:00-06:00' },
    });
    const updates = mergeGcalEvents(existing, [moved], WINDOW_START, WINDOW_END, GCAL);
    expect(updates['appointments/gcal_ev1/startAt']).toBe(
      Date.parse('2026-08-11T09:00:00-06:00'),
    );
    // kind/prepNotes untouched; unchanged fields not rewritten
    expect(Object.keys(updates).some((k) => k.includes('kind'))).toBe(false);
    expect(Object.keys(updates).some((k) => k.includes('prepNotes'))).toBe(false);
    expect(updates['appointments/gcal_ev1/title']).toBeUndefined();
  });

  it('no-op sync produces an empty map', () => {
    const existing = { gcal_ev1: gcalAppt() };
    const updates = mergeGcalEvents(existing, [rawEvent()], WINDOW_START, WINDOW_END, GCAL);
    expect(updates).toEqual({});
  });

  it('deletes vanished gcal events inside the window only', () => {
    const inWindow = gcalAppt();
    const outOfWindow = gcalAppt({
      startAt: Date.parse('2026-07-01T10:00:00-06:00'),
      gcalEventId: 'old1',
    });
    const manual = gcalAppt({ source: 'manual', gcalEventId: null });
    const existing = { gcal_ev1: inWindow, gcal_old1: outOfWindow, manual1: manual };
    const updates = mergeGcalEvents(existing, [], WINDOW_START, WINDOW_END, GCAL);
    expect(updates['appointments/gcal_ev1']).toBeNull();
    expect(updates).not.toHaveProperty('appointments/gcal_old1');
    expect(updates).not.toHaveProperty('appointments/manual1');
  });

  it('an event edited to stop matching keywords gets removed', () => {
    const existing = { gcal_ev1: gcalAppt() };
    const renamed = rawEvent({ summary: 'Lunch with Sam' });
    const updates = mergeGcalEvents(existing, [renamed], WINDOW_START, WINDOW_END, GCAL);
    expect(updates['appointments/gcal_ev1']).toBeNull();
  });

  it('cancelled events are treated as vanished', () => {
    const existing = { gcal_ev1: gcalAppt() };
    const cancelled = rawEvent({ status: 'cancelled' });
    const updates = mergeGcalEvents(existing, [cancelled], WINDOW_START, WINDOW_END, GCAL);
    expect(updates['appointments/gcal_ev1']).toBeNull();
  });
});

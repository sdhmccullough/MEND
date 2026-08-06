// Pure merge of fetched Google Calendar events into the appointments node.
// Produces a multi-path update map applied atomically by sync.applyGcalMerge.
//
// Ownership split: Google owns title/startAt/endAt/location for gcal-sourced
// appointments; the app owns kind, notes, prepNotes, outcomeNotes — those
// must survive every re-sync. Deletions are scoped to the fetched window so
// a narrow fetch can never wipe history.

import type { Appointment, ApptKind, GcalSettings } from './schema';
import type { GcalRawEvent } from './gcal';
import { parseDateKey } from './dates';

/** Deterministic appointment id for an event — re-syncs update in place.
 * RTDB keys forbid . # $ [ ] / — sanitize (rare in Google event ids). */
export function gcalApptId(eventId: string): string {
  return 'gcal_' + eventId.replace(/[.#$[\]/]/g, '-');
}

export interface ParsedEvent {
  eventId: string;
  title: string;
  location: string;
  startAt: number;
  endAt: number | null;
  allDay: boolean;
}

/** Parse a raw API event; null for cancelled or unparseable ones. All-day
 * events land at local midnight with no end. */
export function parseGcalEvent(ev: GcalRawEvent): ParsedEvent | null {
  if (!ev.id || ev.status === 'cancelled') return null;
  let startAt: number;
  let endAt: number | null = null;
  let allDay = false;
  if (ev.start?.dateTime) {
    startAt = Date.parse(ev.start.dateTime);
    if (ev.end?.dateTime) endAt = Date.parse(ev.end.dateTime);
  } else if (ev.start?.date) {
    startAt = parseDateKey(ev.start.date).getTime();
    allDay = true;
  } else {
    return null;
  }
  if (!Number.isFinite(startAt)) return null;
  return {
    eventId: ev.id,
    title: ev.summary ?? '(no title)',
    location: ev.location ?? '',
    startAt,
    endAt: endAt !== null && Number.isFinite(endAt) ? endAt : null,
    allDay,
  };
}

/** Which events count as medical: per-event overrides first, then the
 * keyword filter (case-insensitive substring match on the title). */
export function eventMatches(ev: ParsedEvent, gcal: GcalSettings): boolean {
  if (gcal.excludeEventIds[ev.eventId]) return false;
  if (gcal.includeEventIds[ev.eventId]) return true;
  const title = ev.title.toLowerCase();
  return gcal.keywords.some((k) => k && title.includes(k.toLowerCase()));
}

/** Rough kind guess for NEW events only — the user's later edits win. */
export function guessKind(title: string): ApptKind {
  const t = title.toLowerCase();
  if (/\b(pt|physical therapy|physio)\b/.test(t)) return 'pt';
  if (/\b(mri|x-?ray|imaging|ct scan|ultrasound)\b/.test(t)) return 'imaging';
  if (/\b(dr\.?|doctor|ortho|surgeon|clinic|follow ?up)\b/.test(t)) return 'doctor';
  return 'other';
}

/** Build the atomic update map: creates, gcal-field updates, and
 * window-scoped deletions of events that vanished or stopped matching. */
export function mergeGcalEvents(
  existing: Record<string, Appointment>,
  rawEvents: GcalRawEvent[],
  windowStartMs: number,
  windowEndMs: number,
  gcal: GcalSettings,
): Record<string, unknown> {
  const updates: Record<string, unknown> = {};
  const matchedIds = new Set<string>();

  for (const raw of rawEvents) {
    const ev = parseGcalEvent(raw);
    if (!ev || !eventMatches(ev, gcal)) continue;
    const id = gcalApptId(ev.eventId);
    matchedIds.add(id);
    const prior = existing[id];
    if (!prior) {
      const appt: Appointment = {
        title: ev.title,
        startAt: ev.startAt,
        endAt: ev.endAt,
        kind: guessKind(ev.title),
        location: ev.location,
        source: 'gcal',
        gcalEventId: ev.eventId,
        notes: '',
        prepNotes: '',
        outcomeNotes: '',
      };
      updates[`appointments/${id}`] = appt;
    } else {
      // Update only gcal-owned fields, and only when they changed —
      // app-owned fields (kind/notes/prep/outcome) are never touched.
      if (prior.title !== ev.title) updates[`appointments/${id}/title`] = ev.title;
      if (prior.startAt !== ev.startAt) updates[`appointments/${id}/startAt`] = ev.startAt;
      if (prior.endAt !== ev.endAt) updates[`appointments/${id}/endAt`] = ev.endAt;
      if (prior.location !== ev.location) {
        updates[`appointments/${id}/location`] = ev.location;
      }
    }
  }

  // Window-scoped deletions: a gcal appointment inside the fetched window
  // that no longer appears (deleted, or edited to stop matching) goes away.
  for (const [id, appt] of Object.entries(existing)) {
    if (appt.source !== 'gcal') continue;
    if (appt.startAt < windowStartMs || appt.startAt > windowEndMs) continue;
    if (!matchedIds.has(id)) updates[`appointments/${id}`] = null;
  }

  return updates;
}

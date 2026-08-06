// The inbox interpreter: Hermes (or any granted agent) writes raw payloads
// to inbox/$id; THIS module — pure and tested — turns them into validated
// household updates. Rules validate the envelope; the payload contract
// lives here (and in docs/HERMES-CONTRACT.md, which mirrors this file).
//
// PayDay's three-layer sensor lesson: keep the writer dumb, interpret
// app-side, and let a human tap Apply. Update paths are deterministic from
// the inbox id, so re-applying is idempotent.

import type { DoseRecord, InboxItem, Med, PtSession } from './schema';
import { normalizeExercise } from './schema';
import { epochToDateKey, formatEpochTime, formatHHMM12 } from './dates';
import { scheduledDoseId } from './doses';

export interface ApplyContext {
  meds: Record<string, Med>;
  uid: string; // the member tapping Apply — they own the resulting records
  now: number;
}

export type InboxOutcome =
  | { ok: true; updates: Record<string, unknown>; summary: string }
  | { ok: false; reason: string };

function rec(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
}

function list(v: unknown): unknown[] {
  if (Array.isArray(v)) return v;
  if (v && typeof v === 'object') return Object.values(v);
  return [];
}

function pain(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v)
    ? Math.min(10, Math.max(0, Math.round(v)))
    : null;
}

function epoch(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : fallback;
}

/** Find a med by id, or by case-insensitive name (Hermes hears names, not
 * ids). Ambiguity (two meds sharing a name) rejects rather than guesses. */
export function resolveMed(
  meds: Record<string, Med>,
  medId: unknown,
  medName: unknown,
): { id: string; med: Med } | { error: string } {
  if (typeof medId === 'string' && meds[medId]) return { id: medId, med: meds[medId] };
  if (typeof medName === 'string' && medName.trim()) {
    const needle = medName.trim().toLowerCase();
    const hits = Object.entries(meds).filter(([, m]) => m.name.toLowerCase() === needle);
    if (hits.length === 1) return { id: hits[0][0], med: hits[0][1] };
    if (hits.length > 1) return { error: `Multiple meds named "${medName}".` };
    return { error: `No med named "${medName}".` };
  }
  return { error: 'Payload names no medication.' };
}

function interpretPtSession(
  id: string,
  item: InboxItem,
  ctx: ApplyContext,
): InboxOutcome {
  const p = rec(item.payload);
  if (!p) return { ok: false, reason: 'Payload is not an object.' };
  const exercises = list(p.exercises).map(normalizeExercise).filter((e) => e.name);
  if (exercises.length === 0) {
    return { ok: false, reason: 'No recognizable exercises in the payload.' };
  }
  const painPre = pain(p.painPre);
  const painPost = pain(p.painPost);
  const rom: Record<string, number> = {};
  for (const [joint, deg] of Object.entries(rec(p.rom) ?? {})) {
    if (typeof deg === 'number' && Number.isFinite(deg)) rom[joint] = deg;
  }
  const session: PtSession = {
    at: epoch(p.at, item.receivedAt || ctx.now),
    kind: p.kind === 'home' ? 'home' : 'clinic',
    exercises,
    painPre,
    painPost,
    rom,
    therapistNotes: typeof p.therapistNotes === 'string' ? p.therapistNotes : '',
    source: 'hermes',
    by: ctx.uid,
  };
  const painBit =
    painPre !== null && painPost !== null ? `, pain ${painPre}→${painPost}` : '';
  return {
    ok: true,
    updates: { [`ptSessions/pt_${id}`]: session },
    summary: `${session.kind === 'home' ? 'Home' : 'Clinic'} PT session — ${exercises.length} exercise${exercises.length === 1 ? '' : 's'}${painBit}`,
  };
}

function interpretDoseLog(id: string, item: InboxItem, ctx: ApplyContext): InboxOutcome {
  const p = rec(item.payload);
  if (!p) return { ok: false, reason: 'Payload is not an object.' };
  const resolved = resolveMed(ctx.meds, p.medId, p.medName);
  if ('error' in resolved) return { ok: false, reason: resolved.error };

  const takenAt = epoch(p.at, item.receivedAt || ctx.now);
  const dateKey =
    typeof p.dateKey === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(p.dateKey)
      ? p.dateKey
      : epochToDateKey(takenAt);
  const slot =
    typeof p.slot === 'string' && /^\d{2}:\d{2}$/.test(p.slot) ? p.slot : null;

  const record: DoseRecord = {
    medId: resolved.id,
    plannedAt: slot,
    takenAt,
    units: typeof p.units === 'number' && p.units > 0 ? p.units : 1,
    status: 'taken',
    backfilled: false,
    by: ctx.uid,
    note: typeof p.note === 'string' ? p.note : '',
  };
  const path = slot
    ? `doses/${dateKey}/${scheduledDoseId(resolved.id, slot)}`
    : `doses/${dateKey}/prn_inbox_${id}`;
  return {
    ok: true,
    updates: { [path]: record },
    summary: `${resolved.med.name} taken ${formatEpochTime(takenAt)}${slot ? ` (${formatHHMM12(slot)} dose)` : ''}`,
  };
}

function interpretMetric(item: InboxItem, ctx: ApplyContext): InboxOutcome {
  const p = rec(item.payload);
  if (!p) return { ok: false, reason: 'Payload is not an object.' };
  const painVal = pain(p.pain);
  const notes = typeof p.notes === 'string' ? p.notes.trim() : '';
  if (painVal === null && !notes) {
    return { ok: false, reason: 'Metric payload has neither pain nor notes.' };
  }
  const dateKey =
    typeof p.dateKey === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(p.dateKey)
      ? p.dateKey
      : epochToDateKey(item.receivedAt || ctx.now);
  const patch: Record<string, unknown> = { by: ctx.uid };
  if (painVal !== null) patch.pain = painVal;
  if (notes) patch.notes = notes;
  const updates: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(patch)) updates[`metrics/${dateKey}/${k}`] = v;
  return {
    ok: true,
    updates,
    summary: `Day log for ${dateKey}${painVal !== null ? ` — pain ${painVal}/10` : ''}${notes ? ` — “${notes}”` : ''}`,
  };
}

/** Interpret a pending inbox item into household updates + a human summary.
 * Never throws; malformed payloads come back as { ok: false, reason }. */
export function interpretInboxItem(
  id: string,
  item: InboxItem,
  ctx: ApplyContext,
): InboxOutcome {
  switch (item.type) {
    case 'ptSession':
      return interpretPtSession(id, item, ctx);
    case 'doseLog':
      return interpretDoseLog(id, item, ctx);
    case 'metric':
      return interpretMetric(item, ctx);
    default:
      return { ok: false, reason: `Unknown item type.` };
  }
}

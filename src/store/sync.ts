// Firebase sync layer. Lives outside React; listeners patch the zustand
// store, and store actions write back through SCOPED paths — never a
// whole-state overwrite, so concurrent members can't clobber each other.

import {
  onValue,
  ref,
  update,
  remove,
  serverTimestamp,
  push,
  get,
  child,
  type DatabaseReference,
  type Unsubscribe,
} from 'firebase/database';
import { db } from '../lib/firebase';
import { patchStore, readStore, useStore } from './useStore';
import {
  normalizeAppointment,
  normalizeDoses,
  normalizeHep,
  normalizeInboxItem,
  normalizeInjury,
  normalizeKeyed,
  normalizeMed,
  normalizeMember,
  normalizeMetric,
  normalizePtSession,
  normalizeSettings,
  type Appointment,
  type DoseRecord,
  type Exercise,
  type GcalSettings,
  type Injury,
  type Med,
  type PtSession,
} from '../lib/schema';
import { todayKey } from '../lib/dates';
import { runMigrationIfNeeded } from './migrate';

let subscriptions: Unsubscribe[] = [];
let currentHid: string | null = null;

// ---- offline cache --------------------------------------------------------
// RTDB's web SDK has no disk persistence, so we mirror household slices to
// localStorage (per uid+household) and hydrate before listeners attach.
// This is what makes an offline app launch show data instead of a blank —
// PT clinics and hospital basements have terrible signal.

const CACHE_SLICES = [
  'injury',
  'meds',
  'doses',
  'ptSessions',
  'metrics',
  'appointments',
  'hep',
  'settings',
  'inbox',
  'agents',
  'members',
] as const;

function cacheKey(u: string, hid: string): string {
  // Schema version in the key: a bump invalidates stale caches for free.
  return `mend:v1:${u}:${hid}`;
}

function hydrateFromCache(hid: string): void {
  const u = uid();
  if (!u) return;
  try {
    const raw = localStorage.getItem(cacheKey(u, hid));
    if (!raw) return;
    const cached = JSON.parse(raw) as Record<string, unknown>;
    patchStore({
      injury: normalizeInjury(cached.injury),
      meds: normalizeKeyed(cached.meds, normalizeMed),
      doses: normalizeDoses(cached.doses),
      ptSessions: normalizeKeyed(cached.ptSessions, normalizePtSession),
      metrics: normalizeKeyed(cached.metrics, normalizeMetric),
      appointments: normalizeKeyed(cached.appointments, normalizeAppointment),
      hep: normalizeHep(cached.hep),
      settings: normalizeSettings(cached.settings),
      inbox: normalizeKeyed(cached.inbox, normalizeInboxItem),
      agents: normalizeKeyed(cached.agents, (v) => v === true),
      members: normalizeKeyed(cached.members, normalizeMember),
    });
  } catch {
    /* corrupt cache — live data will replace it */
  }
}

let persistTimer: ReturnType<typeof setTimeout> | null = null;

function schedulePersist(): void {
  if (persistTimer) return;
  persistTimer = setTimeout(() => {
    persistTimer = null;
    const s = readStore();
    const u = s.user?.uid;
    if (!u || !s.householdId) return;
    try {
      const slice: Record<string, unknown> = {};
      for (const k of CACHE_SLICES) slice[k] = s[k];
      localStorage.setItem(cacheKey(u, s.householdId), JSON.stringify(slice));
    } catch {
      /* quota / private mode — Firebase remains source of truth */
    }
  }, 250);
}

function hhRef(path = ''): DatabaseReference {
  // Demo mode: point writes at a rules-denied dummy path so interactions
  // fail softly (async, caught, toasted) instead of throwing in handlers.
  const hid = readStore().demoMode ? 'demo' : currentHid;
  if (!hid) throw new Error('No household attached');
  return ref(db, `households/${hid}${path ? '/' + path : ''}`);
}

function uid(): string | undefined {
  return readStore().user?.uid;
}

function newKey(): string {
  return push(child(ref(db), 'x')).key as string;
}

// ---- attach / detach ------------------------------------------------------

export async function attachHousehold(hid: string): Promise<void> {
  detachHousehold();
  currentHid = hid;
  patchStore({ householdId: hid, syncStatus: 'connecting' });

  hydrateFromCache(hid);

  try {
    await runMigrationIfNeeded(hid);
  } catch (err) {
    // Never block attach on migration; it retries on the next launch.
    console.error('Migration check failed:', err);
  }
  if (currentHid !== hid) return; // household switched mid-migration

  const nodes: Array<[string, (v: unknown) => void]> = [
    ['injury', (v) => patchStore({ injury: normalizeInjury(v) })],
    ['meds', (v) => patchStore({ meds: normalizeKeyed(v, normalizeMed) })],
    ['doses', (v) => patchStore({ doses: normalizeDoses(v) })],
    ['ptSessions', (v) => patchStore({ ptSessions: normalizeKeyed(v, normalizePtSession) })],
    ['metrics', (v) => patchStore({ metrics: normalizeKeyed(v, normalizeMetric) })],
    [
      'appointments',
      (v) => patchStore({ appointments: normalizeKeyed(v, normalizeAppointment) }),
    ],
    ['hep', (v) => patchStore({ hep: normalizeHep(v) })],
    ['settings', (v) => patchStore({ settings: normalizeSettings(v) })],
    ['inbox', (v) => patchStore({ inbox: normalizeKeyed(v, normalizeInboxItem) })],
    ['agents', (v) => patchStore({ agents: normalizeKeyed(v, (x) => x === true) })],
    ['members', (v) => patchStore({ members: normalizeKeyed(v, normalizeMember) })],
    ['meta/ownerUid', (v) => patchStore({ ownerUid: typeof v === 'string' ? v : null })],
  ];

  for (const [path, apply] of nodes) {
    subscriptions.push(
      onValue(
        hhRef(path),
        (snap) => {
          apply(snap.val());
          patchStore({ syncStatus: 'synced' });
        },
        () => patchStore({ syncStatus: 'offline' }),
      ),
    );
  }

  // Connection state drives the indicator.
  subscriptions.push(
    onValue(ref(db, '.info/connected'), (snap) => {
      patchStore({ syncStatus: snap.val() === true ? 'synced' : 'offline' });
    }),
  );

  // Mirror every store change into the offline cache.
  subscriptions.push(useStore.subscribe(schedulePersist));
}

export function detachHousehold(): void {
  for (const off of subscriptions) off();
  subscriptions = [];
  currentHid = null;
}

// ---- writes ---------------------------------------------------------------

function writing<T>(p: Promise<T>): Promise<T> {
  patchStore({ syncStatus: 'syncing' });
  return p.then(
    (v) => {
      patchStore({ syncStatus: 'synced' });
      return v;
    },
    (err) => {
      patchStore({ syncStatus: 'offline' });
      throw err;
    },
  );
}

// ---- injury profile ---------------------------------------------------------

export function saveInjury(patch: Partial<Injury>): Promise<void> {
  return writing(update(hhRef('injury'), patch));
}

// ---- meds -------------------------------------------------------------------

/** Create or update a med; returns its id. */
export function saveMed(medId: string | null, med: Med): Promise<string> {
  const id = medId ?? newKey();
  return writing(update(hhRef(`meds/${id}`), med).then(() => id));
}

export function setMedActive(medId: string, active: boolean): Promise<void> {
  return writing(update(hhRef(`meds/${medId}`), { active }));
}

// ---- doses ------------------------------------------------------------------
// Scheduled slots get deterministic ids so both spouses tapping the same
// slot converge on ONE record (last write wins on the same logical dose).

export function scheduledDoseId(medId: string, slot: string): string {
  return `${medId}_${slot.replace(':', '')}`;
}

function doseRecord(partial: Omit<DoseRecord, 'by' | 'note'> & { note?: string }): DoseRecord {
  return { ...partial, note: partial.note ?? '', by: uid() ?? '' };
}

/** Log a scheduled dose as taken (tap = taken now; takenAt overridable). */
export function logDoseTaken(
  medId: string,
  dateKey: string,
  slot: string,
  takenAt: number = Date.now(),
): Promise<void> {
  const rec = doseRecord({
    medId,
    plannedAt: slot,
    takenAt,
    status: 'taken',
    backfilled: false,
  });
  return writing(update(hhRef(`doses/${dateKey}/${scheduledDoseId(medId, slot)}`), rec));
}

export function skipDose(
  medId: string,
  dateKey: string,
  slot: string,
  note = '',
): Promise<void> {
  const rec = doseRecord({
    medId,
    plannedAt: slot,
    takenAt: null,
    status: 'skipped',
    backfilled: false,
    note,
  });
  return writing(update(hhRef(`doses/${dateKey}/${scheduledDoseId(medId, slot)}`), rec));
}

/** Log a PRN (as-needed) or interval dose — no fixed slot to collide on. */
export function logPrnDose(medId: string, note = ''): Promise<void> {
  const rec = doseRecord({
    medId,
    plannedAt: null,
    takenAt: Date.now(),
    status: 'taken',
    backfilled: false,
    note,
  });
  return writing(update(hhRef(`doses/${todayKey()}/prn_${newKey()}`), rec));
}

/** Undo a mistaken dose log. Rules refuse deletion of backfilled records. */
export function undoDose(dateKey: string, doseId: string): Promise<void> {
  return writing(remove(hhRef(`doses/${dateKey}/${doseId}`)));
}

/** Commit a backfill selection as ONE atomic multi-path update. The map is
 * built by lib/backfill.ts; every record carries backfilled: true. */
export function commitBackfill(updates: Record<string, DoseRecord>): Promise<void> {
  return writing(update(hhRef(), updates));
}

// ---- daily metrics ------------------------------------------------------------

export function saveMetric(
  dateKey: string,
  patch: { pain?: number | null; notes?: string },
): Promise<void> {
  return writing(update(hhRef(`metrics/${dateKey}`), { ...patch, by: uid() ?? null }));
}

// ---- PT sessions / HEP ---------------------------------------------------------

export function savePtSession(sessionId: string | null, session: PtSession): Promise<string> {
  const id = sessionId ?? newKey();
  return writing(update(hhRef(`ptSessions/${id}`), session).then(() => id));
}

export function deletePtSession(sessionId: string): Promise<void> {
  return writing(remove(hhRef(`ptSessions/${sessionId}`)));
}

export function saveHep(exercises: Exercise[]): Promise<void> {
  return writing(update(hhRef('hep'), { exercises, updatedAt: serverTimestamp() }));
}

// ---- appointments ---------------------------------------------------------------

export function saveAppointment(
  apptId: string | null,
  appt: Appointment,
): Promise<string> {
  const id = apptId ?? newKey();
  return writing(update(hhRef(`appointments/${id}`), appt).then(() => id));
}

export function deleteAppointment(apptId: string): Promise<void> {
  return writing(remove(hhRef(`appointments/${apptId}`)));
}

/** Apply a Google Calendar merge (built by lib/gcalMerge.ts) atomically. */
export function applyGcalMerge(updates: Record<string, unknown>): Promise<void> {
  if (Object.keys(updates).length === 0) return Promise.resolve();
  return writing(update(hhRef(), updates));
}

export function saveGcalSettings(patch: Partial<GcalSettings>): Promise<void> {
  return writing(update(hhRef('settings/gcal'), patch));
}

// ---- Hermes inbox / agents -------------------------------------------------------

/** Apply an inbox suggestion: the interpreted data writes plus the status
 * flip land in ONE update, so an item can never apply twice. */
export function applyInboxItem(
  inboxId: string,
  dataUpdates: Record<string, unknown>,
): Promise<void> {
  const updates: Record<string, unknown> = { ...dataUpdates };
  updates[`inbox/${inboxId}/status`] = 'applied';
  return writing(update(hhRef(), updates));
}

export function dismissInboxItem(inboxId: string): Promise<void> {
  return writing(update(hhRef(`inbox/${inboxId}`), { status: 'dismissed' }));
}

/** Grant or revoke an agent identity's write access to the inbox. */
export function setAgentGrant(agentUid: string, granted: boolean): Promise<void> {
  return writing(
    granted
      ? update(hhRef('agents'), { [agentUid]: true })
      : remove(hhRef(`agents/${agentUid}`)),
  );
}

// ---- household ------------------------------------------------------------

export async function lookupHouseholdId(uidVal: string): Promise<string | null> {
  const snap = await get(ref(db, `userHouseholds/${uidVal}`));
  return typeof snap.val() === 'string' ? snap.val() : null;
}

export async function createHousehold(uidVal: string, email: string): Promise<string> {
  const updates: Record<string, unknown> = {};
  updates[`households/${uidVal}/members/${uidVal}`] = {
    email,
    joinedAt: serverTimestamp(),
  };
  updates[`userHouseholds/${uidVal}`] = uidVal;
  await update(ref(db), updates);
  return uidVal;
}

// ---- invites --------------------------------------------------------------

const INVITE_TTL_MS = 72 * 60 * 60 * 1000;
// No 0/O/1/I — tokens get read aloud and retyped.
const TOKEN_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function randomToken(length = 10): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let out = '';
  for (const b of bytes) out += TOKEN_ALPHABET[b % TOKEN_ALPHABET.length];
  return out;
}

export interface Invite {
  token: string;
  url: string;
  expiresAt: number;
}

/** Create a single-use invite link for the current household (rules enforce
 * expiry and single use server-side). */
export async function createInvite(): Promise<Invite> {
  const hid = currentHid;
  const u = uid();
  if (!hid || !u) throw new Error('Not attached to a household.');
  const token = randomToken();
  const expiresAt = Date.now() + INVITE_TTL_MS;
  await update(ref(db, `invites/${token}`), {
    hid,
    createdBy: u,
    createdAt: serverTimestamp(),
    expiresAt,
  });
  return {
    token,
    url: `${location.origin}/?invite=${token}`,
    expiresAt,
  };
}

/** Redeem an invite: joins its household and returns the household id. */
export async function joinViaInvite(
  uidVal: string,
  email: string,
  token: string,
): Promise<string> {
  let invite: { hid?: string; expiresAt?: number; usedBy?: string } | null;
  try {
    const snap = await get(ref(db, `invites/${token}`));
    invite = snap.val();
  } catch (err) {
    // Rules deny reads of expired tokens, so this is the common expiry path.
    const msg = String((err as { code?: string })?.code ?? err);
    if (/permission.denied/i.test(msg)) {
      throw new Error('This invite link is invalid or has expired. Ask for a new one.');
    }
    throw err;
  }
  if (!invite || typeof invite.hid !== 'string') {
    throw new Error('This invite link is invalid or was revoked.');
  }
  if (invite.usedBy) {
    if (invite.usedBy === uidVal) return invite.hid; // already redeemed by us
    throw new Error('This invite link has already been used.');
  }
  if (typeof invite.expiresAt !== 'number' || invite.expiresAt <= Date.now()) {
    throw new Error('This invite link has expired. Ask for a new one.');
  }

  const updates: Record<string, unknown> = {};
  updates[`households/${invite.hid}/members/${uidVal}`] = {
    email,
    joinedAt: serverTimestamp(),
    inviteToken: token,
  };
  updates[`userHouseholds/${uidVal}`] = invite.hid;
  updates[`invites/${token}/usedBy`] = uidVal;
  try {
    await update(ref(db), updates);
  } catch (err) {
    const msg = String((err as { code?: string })?.code ?? err);
    if (/permission.denied/i.test(msg)) {
      // Rules re-check expiry/single-use atomically; a race lands here.
      throw new Error('This invite link is no longer valid. Ask for a new one.');
    }
    throw err;
  }
  return invite.hid;
}

// ---- membership -----------------------------------------------------------

/** Owner removes a member (rules also allow removing yourself). */
export function removeMember(targetUid: string): Promise<void> {
  return writing(remove(hhRef(`members/${targetUid}`)));
}

/** Leave the current household and fall back to (or create) your own. */
export async function leaveHousehold(uidVal: string, email: string): Promise<void> {
  const hid = currentHid;
  if (!hid || hid === uidVal) return;
  const updates: Record<string, unknown> = {};
  updates[`households/${hid}/members/${uidVal}`] = null;
  updates[`households/${uidVal}/members/${uidVal}`] = {
    email,
    joinedAt: serverTimestamp(),
  };
  updates[`userHouseholds/${uidVal}`] = uidVal;
  await update(ref(db), updates);
}

/** True if we can still read our member entry; PERMISSION_DENIED means we
 * were removed from the household. Network failures resolve true (benefit
 * of the doubt — offline must not eject anyone). */
export async function verifyMembership(hid: string, uidVal: string): Promise<boolean> {
  if (hid === uidVal) return true;
  try {
    await get(ref(db, `households/${hid}/members/${uidVal}`));
    return true;
  } catch (err) {
    return !/permission.denied/i.test(String((err as { code?: string })?.code ?? err));
  }
}

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
import {
  deleteObject,
  getDownloadURL,
  getStorage,
  ref as storageRef,
  uploadBytes,
} from 'firebase/storage';
import { app, auth, db } from '../lib/firebase';
import { patchStore, readStore, useStore } from './useStore';
import {
  normalizeAppointment,
  normalizeDoses,
  normalizeGuideSection,
  normalizeHep,
  normalizeInboxItem,
  normalizeInjury,
  normalizeKeyed,
  normalizeMed,
  normalizeMember,
  normalizeMetric,
  normalizePhase,
  normalizePhotos,
  normalizePtSession,
  normalizeRoutine,
  normalizeRoutineLogs,
  normalizeSettings,
  normalizeSpacingRule,
  normalizeTimer,
  type Appointment,
  type DoseRecord,
  type Exercise,
  type GcalSettings,
  type GuideSection,
  type Injury,
  type Med,
  type ProtocolPhase,
  type PtSession,
  type Routine,
  type SpacingRule,
} from '../lib/schema';
import { todayKey } from '../lib/dates';
import { scheduledDoseId } from '../lib/doses';
import { runMigrationIfNeeded } from './migrate';

let subscriptions: Unsubscribe[] = [];
let currentHid: string | null = null;
/** Live connection state from .info/connected, so a rejected write isn't
 * misreported as being offline. */
let connected = true;

// ---- offline cache --------------------------------------------------------
// RTDB's web SDK has no disk persistence, so we mirror household slices to
// localStorage (per uid+household) and hydrate before listeners attach.
// This is what makes an offline app launch show data instead of a blank —
// PT clinics and hospital basements have terrible signal.

const CACHE_SLICES = [
  'injury',
  'meds',
  'spacing',
  'doses',
  'ptSessions',
  'metrics',
  'appointments',
  'hep',
  'guide',
  'photos',
  'routines',
  'routineLogs',
  'timers',
  'protocol',
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
      spacing: normalizeKeyed(cached.spacing, normalizeSpacingRule),
      doses: normalizeDoses(cached.doses),
      ptSessions: normalizeKeyed(cached.ptSessions, normalizePtSession),
      metrics: normalizeKeyed(cached.metrics, normalizeMetric),
      appointments: normalizeKeyed(cached.appointments, normalizeAppointment),
      hep: normalizeHep(cached.hep),
      guide: normalizeKeyed(cached.guide, normalizeGuideSection),
      photos: normalizePhotos(cached.photos),
      routines: normalizeKeyed(cached.routines, normalizeRoutine),
      routineLogs: normalizeRoutineLogs(cached.routineLogs),
      timers: normalizeKeyed(cached.timers, normalizeTimer),
      protocol: normalizeKeyed(cached.protocol, normalizePhase),
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
    ['spacing', (v) => patchStore({ spacing: normalizeKeyed(v, normalizeSpacingRule) })],
    ['doses', (v) => patchStore({ doses: normalizeDoses(v) })],
    ['ptSessions', (v) => patchStore({ ptSessions: normalizeKeyed(v, normalizePtSession) })],
    ['metrics', (v) => patchStore({ metrics: normalizeKeyed(v, normalizeMetric) })],
    [
      'appointments',
      (v) => patchStore({ appointments: normalizeKeyed(v, normalizeAppointment) }),
    ],
    ['hep', (v) => patchStore({ hep: normalizeHep(v) })],
    ['guide', (v) => patchStore({ guide: normalizeKeyed(v, normalizeGuideSection) })],
    ['photos', (v) => patchStore({ photos: normalizePhotos(v) })],
    ['routines', (v) => patchStore({ routines: normalizeKeyed(v, normalizeRoutine) })],
    ['routineLogs', (v) => patchStore({ routineLogs: normalizeRoutineLogs(v) })],
    ['timers', (v) => patchStore({ timers: normalizeKeyed(v, normalizeTimer) })],
    ['protocol', (v) => patchStore({ protocol: normalizeKeyed(v, normalizePhase) })],
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
      connected = snap.val() === true;
      patchStore({ syncStatus: connected ? 'synced' : 'offline' });
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
      // A rejected write (bad shape, rules) is not a lost connection —
      // claiming "Offline" sent us chasing the network instead of the
      // actual error. Trust .info/connected for that, and surface the
      // real reason here.
      console.error('Write rejected:', err);
      patchStore({ syncStatus: connected ? 'synced' : 'offline' });
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

export function saveSpacingRule(
  ruleId: string | null,
  rule: SpacingRule,
): Promise<string> {
  const id = ruleId ?? newKey();
  return writing(update(hhRef(`spacing/${id}`), rule).then(() => id));
}

export function deleteSpacingRule(ruleId: string): Promise<void> {
  return writing(remove(hhRef(`spacing/${ruleId}`)));
}

/** Archive = inactive + close the schedule window today, so past slots
 * keep counting toward adherence and future days expect nothing. */
export function archiveMed(medId: string): Promise<void> {
  return writing(
    update(hhRef(`meds/${medId}`), { active: false, 'schedule/endOn': todayKey() }),
  );
}

export function unarchiveMed(medId: string): Promise<void> {
  return writing(
    update(hhRef(`meds/${medId}`), { active: true, 'schedule/endOn': null }),
  );
}

// ---- doses ------------------------------------------------------------------
// Scheduled slots get deterministic ids (lib/doses.scheduledDoseId) so both
// spouses tapping the same slot converge on ONE record.

function doseRecord(partial: Omit<DoseRecord, 'by' | 'note'> & { note?: string }): DoseRecord {
  return { ...partial, note: partial.note ?? '', by: uid() ?? '' };
}

/** Log a scheduled dose as taken (tap = taken now; takenAt overridable). */
export function logDoseTaken(
  medId: string,
  dateKey: string,
  slot: string,
  takenAt: number = Date.now(),
  units = 1,
): Promise<void> {
  const rec = doseRecord({
    medId,
    plannedAt: slot,
    takenAt,
    units,
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
    units: 1,
    status: 'skipped',
    backfilled: false,
    note,
  });
  return writing(update(hhRef(`doses/${dateKey}/${scheduledDoseId(medId, slot)}`), rec));
}

/** Log a PRN (as-needed) or interval dose — no fixed slot to collide on. */
export function logPrnDose(medId: string, note = '', units = 1): Promise<void> {
  const rec = doseRecord({
    medId,
    plannedAt: null,
    takenAt: Date.now(),
    units,
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
  patch: { pain?: number | null; sane?: number | null; notes?: string },
): Promise<void> {
  return writing(update(hhRef(`metrics/${dateKey}`), { ...patch, by: uid() ?? null }));
}

// ---- routines ---------------------------------------------------------------------

/** Log a rep and, for a timed routine, start its countdown — in ONE write.
 * These used to be two chained writes, and a page reload landing between
 * them left the rep logged with no timer running. */
export function logRoutine(
  routineId: string,
  dateKey: string,
  timer?: { label: string; minutes: number },
): Promise<void> {
  const now = Date.now();
  const updates: Record<string, unknown> = {
    [`routineLogs/${dateKey}/${newKey()}`]: {
      routineId,
      at: serverTimestamp(),
      by: uid() ?? null,
    },
  };
  if (timer && timer.minutes > 0) {
    updates[`timers/${routineId}`] = {
      label: timer.label,
      startedAt: now,
      dueAt: now + timer.minutes * 60_000,
      notifiedAt: null,
      by: uid() ?? null,
    };
  }
  return writing(update(hhRef(), updates));
}

/** Undo the most recent rep (mis-taps happen one-handed). */
export function undoRoutineLog(dateKey: string, logId: string): Promise<void> {
  return writing(remove(hhRef(`routineLogs/${dateKey}/${logId}`)));
}

export function cancelRoutineTimer(routineId: string): Promise<void> {
  return writing(remove(hhRef(`timers/${routineId}`)));
}

export function saveRoutine(routineId: string | null, routine: Routine): Promise<string> {
  const id = routineId ?? newKey();
  return writing(update(hhRef(`routines/${id}`), routine).then(() => id));
}

export function deleteRoutine(routineId: string): Promise<void> {
  return writing(remove(hhRef(`routines/${routineId}`)));
}

// ---- protocol phases ---------------------------------------------------------------

export function savePhase(phaseId: string | null, phase: ProtocolPhase): Promise<string> {
  const id = phaseId ?? newKey();
  return writing(update(hhRef(`protocol/${id}`), phase).then(() => id));
}

export function deletePhase(phaseId: string): Promise<void> {
  return writing(remove(hhRef(`protocol/${phaseId}`)));
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

// ---- photos ---------------------------------------------------------------------
// Bytes go to Cloud Storage (rules gated by the hid custom claim, stamped
// by the setHouseholdClaim function); the listing record goes to RTDB.

export async function uploadDayPhoto(dateKey: string, file: File): Promise<void> {
  const hid = readStore().householdId;
  const u = uid();
  if (!hid || !u) throw new Error('Not attached to a household');
  // Claims are stamped server-side; refresh the ID token so a fresh grant
  // is visible to Storage rules (no-op after the first refresh).
  await auth.currentUser?.getIdToken(true);
  const key = newKey();
  const path = `households/${hid}/photos/${dateKey}/${key}`;
  const snap = await uploadBytes(storageRef(getStorage(app), path), file, {
    contentType: file.type || 'image/jpeg',
  });
  const url = await getDownloadURL(snap.ref);
  await writing(
    update(hhRef(`photos/${dateKey}/${key}`), {
      url,
      path,
      by: u,
      at: serverTimestamp(),
    }),
  );
}

export async function deleteDayPhoto(
  dateKey: string,
  photoId: string,
  path: string,
): Promise<void> {
  await deleteObject(storageRef(getStorage(app), path)).catch(() => undefined);
  await writing(remove(hhRef(`photos/${dateKey}/${photoId}`)));
}

// ---- care guide ----------------------------------------------------------------

export function saveGuideSection(
  sectionId: string | null,
  section: Omit<GuideSection, 'updatedAt'>,
): Promise<string> {
  const id = sectionId ?? newKey();
  return writing(
    update(hhRef(`guide/${id}`), { ...section, updatedAt: serverTimestamp() }).then(
      () => id,
    ),
  );
}

export function deleteGuideSection(sectionId: string): Promise<void> {
  return writing(remove(hhRef(`guide/${sectionId}`)));
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

/** One FCM token slot per (uid, device) — read only by the reminder
 * function, never mirrored into the client store. */
export function saveFcmToken(deviceId: string, token: string): Promise<void> {
  const u = uid();
  if (!u) return Promise.reject(new Error('Not signed in'));
  return writing(
    update(hhRef(`settings/fcmTokens/${u}_${deviceId}`), {
      token,
      updatedAt: serverTimestamp(),
    }),
  );
}

export function removeFcmToken(deviceId: string): Promise<void> {
  const u = uid();
  if (!u) return Promise.resolve();
  return writing(remove(hhRef(`settings/fcmTokens/${u}_${deviceId}`)));
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

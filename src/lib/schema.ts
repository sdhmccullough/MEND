// Schema v1 types + snapshot normalizers.
//
// RTDB has no schema: empty objects vanish, arrays come back as objects,
// and any member can write any shape. Every snapshot passes through a
// normalizer before entering the store, so the rest of the app can trust
// the types. Normalizers are total: garbage in, safe defaults out — never
// throw on foreign data.

export const SCHEMA_VERSION = 1;

// ---- injury profile --------------------------------------------------------

export interface Milestone {
  label: string;
  targetOn: string; // dateKey
  achievedOn: string | null;
}

export interface Injury {
  title: string;
  occurredOn: string; // dateKey; '' = not set up yet
  mechanism: string;
  diagnosis: string;
  /** id → display line, e.g. "Dr. Reyes — ortho surgeon". */
  providers: Record<string, string>;
  surgeryOn: string | null;
  targetMilestones: Record<string, Milestone>;
}

// ---- medications -----------------------------------------------------------

export type ScheduleKind = 'times' | 'interval' | 'prn';

/** Dose-text override active from `from` (inclusive) to `to` (inclusive;
 * null = open-ended). Common in injury recovery (steroid tapers, weaning). */
export interface TaperStep {
  from: string; // dateKey
  to: string | null;
  doseText: string;
}

export interface MedSchedule {
  kind: ScheduleKind;
  times: string[]; // 'HH:MM' slots, kind === 'times'
  everyHours: number | null; // kind === 'interval'
  startOn: string; // dateKey
  endOn: string | null;
  taper: TaperStep[];
}

export interface Med {
  name: string;
  doseText: string; // "500 mg", "2 tablets"
  form: string; // tablet, capsule, injection…
  purpose: string;
  prescriber: string;
  schedule: MedSchedule;
  active: boolean;
  notes: string;
  refills: number | null;
}

// ---- doses -----------------------------------------------------------------
// Stored under doses/$dateKey/$doseId. Only ACTIONED doses are stored
// (taken/skipped + backfill); pending/overdue are virtual view states
// computed from the schedule. Scheduled-slot ids are deterministic
// (`${medId}_${HHMM}`) so both spouses converge on the same record.

export type DoseStatus = 'taken' | 'skipped' | 'late' | 'pending';

export interface DoseRecord {
  medId: string;
  plannedAt: string | null; // 'HH:MM' slot; null for PRN
  takenAt: number | null; // epoch ms; null for skipped and backfilled
  status: DoseStatus;
  /** Reconstructed history (entered via backfill). Immutable once true —
   * rules enforce it — so the provable-live record stays distinguishable. */
  backfilled: boolean;
  by: string; // uid of who logged it (care-partner logging is first-class)
  note: string;
}

// ---- physical therapy ------------------------------------------------------

export interface Exercise {
  name: string;
  sets: number;
  reps: number;
  resistance: string; // "red band", "10 lb"…, '' = none
  durationSec: number; // 0 = not timed
}

export interface PtSession {
  at: number; // epoch ms
  kind: 'clinic' | 'home';
  exercises: Exercise[];
  painPre: number | null; // 0–10
  painPost: number | null;
  rom: Record<string, number>; // joint → degrees
  therapistNotes: string;
  source: 'manual' | 'hermes';
  by: string;
}

export interface HepTemplate {
  exercises: Exercise[];
  updatedAt: number | null;
}

// ---- daily metrics ---------------------------------------------------------

export interface DayMetric {
  pain: number | null; // 0–10, one per day, editable
  rom: Record<string, number>;
  notes: string;
  by: string;
}

// ---- appointments ----------------------------------------------------------

export type ApptKind = 'doctor' | 'pt' | 'imaging' | 'other';

export interface Appointment {
  title: string;
  startAt: number; // epoch ms
  endAt: number | null;
  kind: ApptKind;
  location: string;
  source: 'gcal' | 'manual';
  gcalEventId: string | null;
  notes: string;
  prepNotes: string; // questions to ask, before the visit
  outcomeNotes: string; // instructions/decisions, after the visit
}

// ---- Hermes inbox ----------------------------------------------------------
// The ONLY node the agent uid can write. Payload shapes are validated
// app-side in lib/inboxApply.ts; a human always taps Apply.

export type InboxType = 'ptSession' | 'doseLog' | 'metric';
export type InboxStatus = 'pending' | 'applied' | 'dismissed';

export interface InboxItem {
  type: InboxType;
  payload: unknown;
  receivedAt: number;
  status: InboxStatus;
}

// ---- settings / members ----------------------------------------------------

export interface GcalSettings {
  connectedEmail: string; // whose Google account feeds appointments
  calendarIds: string[];
  keywords: string[]; // events matching any keyword count as medical
  includeEventIds: Record<string, true>; // per-event overrides
  excludeEventIds: Record<string, true>;
}

export interface Settings {
  gcal: GcalSettings;
}

export interface Member {
  email: string;
  joinedAt: number | null;
}

export const DEFAULT_INJURY: Injury = {
  title: '',
  occurredOn: '',
  mechanism: '',
  diagnosis: '',
  providers: {},
  surgeryOn: null,
  targetMilestones: {},
};

export const DEFAULT_GCAL: GcalSettings = {
  connectedEmail: '',
  calendarIds: [],
  keywords: ['PT', 'physical therapy', 'Dr.', 'doctor', 'MRI', 'imaging'],
  includeEventIds: {},
  excludeEventIds: {},
};

export const DEFAULT_SETTINGS: Settings = { gcal: DEFAULT_GCAL };

export const DEFAULT_HEP: HepTemplate = { exercises: [], updatedAt: null };

// ---- coercion primitives ---------------------------------------------------

function num(v: unknown, fallback = 0): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

function str(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback;
}

function rec(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};
}

/** RTDB round-trips arrays as keyed objects; accept both. */
function list(v: unknown): unknown[] {
  if (Array.isArray(v)) return v.filter((x) => x !== null && x !== undefined);
  if (v && typeof v === 'object') {
    return Object.values(v).filter((x) => x !== null && x !== undefined);
  }
  return [];
}

function numOrNull(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function strOrNull(v: unknown): string | null {
  return typeof v === 'string' && v !== '' ? v : null;
}

/** Pain scale: clamp to 0–10 integers, null when absent/garbage. */
function pain(v: unknown): number | null {
  const n = numOrNull(v);
  if (n === null) return null;
  return Math.min(10, Math.max(0, Math.round(n)));
}

function stringMap(v: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, item] of Object.entries(rec(v))) {
    if (typeof item === 'string') out[k] = item;
  }
  return out;
}

function numberMap(v: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, item] of Object.entries(rec(v))) {
    if (typeof item === 'number' && Number.isFinite(item)) out[k] = item;
  }
  return out;
}

function trueMap(v: unknown): Record<string, true> {
  const out: Record<string, true> = {};
  for (const [k, item] of Object.entries(rec(v))) {
    if (item === true) out[k] = true;
  }
  return out;
}

export function normalizeKeyed<T>(
  v: unknown,
  normalizeOne: (item: unknown) => T,
): Record<string, T> {
  const out: Record<string, T> = {};
  for (const [k, item] of Object.entries(rec(v))) out[k] = normalizeOne(item);
  return out;
}

// ---- normalizers -----------------------------------------------------------

export function normalizeMilestone(v: unknown): Milestone {
  const o = rec(v);
  return {
    label: str(o.label),
    targetOn: str(o.targetOn),
    achievedOn: strOrNull(o.achievedOn),
  };
}

export function normalizeInjury(v: unknown): Injury {
  const o = rec(v);
  return {
    title: str(o.title),
    occurredOn: str(o.occurredOn),
    mechanism: str(o.mechanism),
    diagnosis: str(o.diagnosis),
    providers: stringMap(o.providers),
    surgeryOn: strOrNull(o.surgeryOn),
    targetMilestones: normalizeKeyed(o.targetMilestones, normalizeMilestone),
  };
}

function normalizeTaperStep(v: unknown): TaperStep {
  const o = rec(v);
  return {
    from: str(o.from),
    to: strOrNull(o.to),
    doseText: str(o.doseText),
  };
}

export function normalizeSchedule(v: unknown): MedSchedule {
  const o = rec(v);
  const kind = o.kind === 'interval' || o.kind === 'prn' ? o.kind : 'times';
  const times = list(o.times)
    .filter((t): t is string => typeof t === 'string' && /^\d{2}:\d{2}$/.test(t))
    .sort();
  const everyHours = numOrNull(o.everyHours);
  return {
    kind,
    times,
    everyHours: everyHours !== null && everyHours > 0 ? everyHours : null,
    startOn: str(o.startOn),
    endOn: strOrNull(o.endOn),
    taper: list(o.taper).map(normalizeTaperStep),
  };
}

export function normalizeMed(v: unknown): Med {
  const o = rec(v);
  const refills = numOrNull(o.refills);
  return {
    name: str(o.name),
    doseText: str(o.doseText),
    form: str(o.form),
    purpose: str(o.purpose),
    prescriber: str(o.prescriber),
    schedule: normalizeSchedule(o.schedule),
    active: o.active !== false, // default active
    notes: str(o.notes),
    refills: refills !== null && refills >= 0 ? Math.round(refills) : null,
  };
}

export function normalizeDose(v: unknown): DoseRecord {
  const o = rec(v);
  const status =
    o.status === 'taken' || o.status === 'skipped' || o.status === 'late'
      ? o.status
      : 'pending';
  return {
    medId: str(o.medId),
    plannedAt: strOrNull(o.plannedAt),
    takenAt: numOrNull(o.takenAt),
    status,
    backfilled: o.backfilled === true,
    by: str(o.by),
    note: str(o.note),
  };
}

/** doses/$dateKey/$doseId — nested keyed. */
export function normalizeDoses(v: unknown): Record<string, Record<string, DoseRecord>> {
  return normalizeKeyed(v, (day) => normalizeKeyed(day, normalizeDose));
}

export function normalizeExercise(v: unknown): Exercise {
  const o = rec(v);
  return {
    name: str(o.name),
    sets: Math.max(0, Math.round(num(o.sets))),
    reps: Math.max(0, Math.round(num(o.reps))),
    resistance: str(o.resistance),
    durationSec: Math.max(0, Math.round(num(o.durationSec))),
  };
}

export function normalizePtSession(v: unknown): PtSession {
  const o = rec(v);
  return {
    at: num(o.at),
    kind: o.kind === 'home' ? 'home' : 'clinic',
    exercises: list(o.exercises).map(normalizeExercise),
    painPre: pain(o.painPre),
    painPost: pain(o.painPost),
    rom: numberMap(o.rom),
    therapistNotes: str(o.therapistNotes),
    source: o.source === 'hermes' ? 'hermes' : 'manual',
    by: str(o.by),
  };
}

export function normalizeHep(v: unknown): HepTemplate {
  const o = rec(v);
  return {
    exercises: list(o.exercises).map(normalizeExercise),
    updatedAt: numOrNull(o.updatedAt),
  };
}

export function normalizeMetric(v: unknown): DayMetric {
  const o = rec(v);
  return {
    pain: pain(o.pain),
    rom: numberMap(o.rom),
    notes: str(o.notes),
    by: str(o.by),
  };
}

export function normalizeAppointment(v: unknown): Appointment {
  const o = rec(v);
  const kind =
    o.kind === 'doctor' || o.kind === 'pt' || o.kind === 'imaging' ? o.kind : 'other';
  return {
    title: str(o.title),
    startAt: num(o.startAt),
    endAt: numOrNull(o.endAt),
    kind,
    location: str(o.location),
    source: o.source === 'gcal' ? 'gcal' : 'manual',
    gcalEventId: strOrNull(o.gcalEventId),
    notes: str(o.notes),
    prepNotes: str(o.prepNotes),
    outcomeNotes: str(o.outcomeNotes),
  };
}

export function normalizeInboxItem(v: unknown): InboxItem {
  const o = rec(v);
  const type =
    o.type === 'doseLog' || o.type === 'metric' ? o.type : 'ptSession';
  const status =
    o.status === 'applied' || o.status === 'dismissed' ? o.status : 'pending';
  return {
    type,
    payload: o.payload,
    receivedAt: num(o.receivedAt),
    status,
  };
}

export function normalizeGcal(v: unknown): GcalSettings {
  const o = rec(v);
  const keywords = list(o.keywords).filter((k): k is string => typeof k === 'string');
  return {
    connectedEmail: str(o.connectedEmail),
    calendarIds: list(o.calendarIds).filter((k): k is string => typeof k === 'string'),
    keywords: keywords.length ? keywords : DEFAULT_GCAL.keywords,
    includeEventIds: trueMap(o.includeEventIds),
    excludeEventIds: trueMap(o.excludeEventIds),
  };
}

export function normalizeSettings(v: unknown): Settings {
  const o = rec(v);
  return { gcal: normalizeGcal(o.gcal) };
}

export function normalizeMember(v: unknown): Member {
  const o = rec(v);
  return {
    email: str(o.email),
    joinedAt: numOrNull(o.joinedAt),
  };
}

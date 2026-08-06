import { create } from 'zustand';
import type {
  Appointment,
  DayMetric,
  DoseRecord,
  HepTemplate,
  InboxItem,
  Injury,
  Med,
  Member,
  PtSession,
  Settings,
} from '../lib/schema';
import { DEFAULT_HEP, DEFAULT_INJURY, DEFAULT_SETTINGS } from '../lib/schema';

export type SyncStatus = 'connecting' | 'synced' | 'syncing' | 'offline';
export type Tab = 'today' | 'meds' | 'calendar' | 'progress';

export function isTab(v: unknown): v is Tab {
  return v === 'today' || v === 'meds' || v === 'calendar' || v === 'progress';
}

export interface AppUser {
  uid: string;
  email: string;
}

interface Store {
  // session
  user: AppUser | null;
  householdId: string | null;
  syncStatus: SyncStatus;
  authError: string | null;
  /** false while auth state is still resolving on boot */
  authReady: boolean;
  migrating: boolean;

  // household data (mirrors of RTDB nodes, already normalized)
  injury: Injury;
  meds: Record<string, Med>;
  /** dateKey → doseId → record; only actioned doses are stored. */
  doses: Record<string, Record<string, DoseRecord>>;
  ptSessions: Record<string, PtSession>;
  /** dateKey → daily metric (pain quick-log). */
  metrics: Record<string, DayMetric>;
  appointments: Record<string, Appointment>;
  hep: HepTemplate;
  settings: Settings;
  inbox: Record<string, InboxItem>;
  agents: Record<string, boolean>;
  members: Record<string, Member>;
  ownerUid: string | null;

  // ui
  tab: Tab;
  setTab: (tab: Tab) => void;
  /** Invite token from a ?invite= link, pending user confirmation. */
  pendingInvite: string | null;
  setPendingInvite: (token: string | null) => void;
  /** True when the browser offered a deferred install prompt. */
  installAvailable: boolean;
  /** Preview-channel demo: sample data, no auth, nothing persists. */
  demoMode: boolean;
}

export const useStore = create<Store>((set) => ({
  user: null,
  householdId: null,
  syncStatus: 'connecting',
  authError: null,
  authReady: false,
  migrating: false,

  injury: DEFAULT_INJURY,
  meds: {},
  doses: {},
  ptSessions: {},
  metrics: {},
  appointments: {},
  hep: DEFAULT_HEP,
  settings: DEFAULT_SETTINGS,
  inbox: {},
  agents: {},
  members: {},
  ownerUid: null,

  tab: 'today',
  setTab: (tab) => set({ tab }),
  pendingInvite: null,
  setPendingInvite: (token) => set({ pendingInvite: token }),
  installAvailable: false,
  demoMode: false,
}));

/** Imperative setter for non-React modules (sync layer, auth). */
export const patchStore = useStore.setState;
export const readStore = useStore.getState;

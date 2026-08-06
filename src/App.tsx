import { useEffect, useRef, useState } from 'react';
import * as Tabs from '@radix-ui/react-tabs';
import { useStore, type Tab } from './store/useStore';
import { redeemPendingInvite } from './store/auth';
import { runGcalSync } from './store/gcalSync';
import { toast, toastError, Toaster } from './components/ui/Toast';
import { ConfirmDialog } from './components/ui/Dialog';
import { SignInScreen } from './features/auth/SignInScreen';
import { TodayTab } from './features/today/TodayTab';
import { MedsTab } from './features/meds/MedsTab';
import { CalendarTab } from './features/calendar/CalendarTab';
import { ProgressTab } from './features/progress/ProgressTab';
import { GuideTab } from './features/guide/GuideTab';
import { SettingsDialog } from './features/household/SettingsDialog';
import { UpdatePrompt } from './components/UpdatePrompt';
import { IconButton } from './components/ui/Button';
import {
  CalendarIcon,
  ClipboardIcon,
  GearIcon,
  PillIcon,
  SunIcon,
  TrendingUpIcon,
} from './components/icons';

function SyncBadge() {
  const status = useStore((s) => s.syncStatus);
  const text =
    status === 'synced'
      ? 'Synced'
      : status === 'syncing'
        ? 'Syncing…'
        : status === 'offline'
          ? 'Offline'
          : 'Connecting…';
  const dot =
    status === 'synced'
      ? 'bg-accent'
      : status === 'syncing'
        ? 'bg-warn animate-pulse'
        : status === 'offline'
          ? 'bg-danger'
          : 'bg-muted';
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full bg-surface-2 px-2.5 py-1 text-xs font-medium text-muted"
      role="status"
      aria-live="polite"
    >
      <span aria-hidden="true" className={`size-2 rounded-full ${dot}`} />
      {text}
    </span>
  );
}

const TAB_ITEMS: Array<{ value: Tab; label: string; icon: typeof SunIcon }> = [
  { value: 'today', label: 'Today', icon: SunIcon },
  { value: 'meds', label: 'Meds', icon: PillIcon },
  { value: 'calendar', label: 'Calendar', icon: CalendarIcon },
  { value: 'progress', label: 'Progress', icon: TrendingUpIcon },
  { value: 'guide', label: 'Guide', icon: ClipboardIcon },
];

function AppShell() {
  const tab = useStore((s) => s.tab);
  const setTab = useStore((s) => s.setTab);
  const migrating = useStore((s) => s.migrating);
  const demoMode = useStore((s) => s.demoMode);
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Silent Google Calendar sync once per app open, as soon as the synced
  // settings reveal a connected calendar (no-op until then).
  const calendarConnected = useStore((s) => s.settings.gcal.calendarIds.length > 0);
  const gcalSyncedOnce = useRef(false);
  useEffect(() => {
    if (calendarConnected && !gcalSyncedOnce.current) {
      gcalSyncedOnce.current = true;
      void runGcalSync(false);
    }
  }, [calendarConnected]);

  return (
    <Tabs.Root value={tab} onValueChange={(v) => setTab(v as Tab)}>
      <div className="mx-auto flex min-h-dvh max-w-lg flex-col px-4 pb-24 sm:max-w-2xl lg:max-w-5xl lg:pb-8">
        <header className="flex items-center justify-between py-4">
          <div className="flex items-center gap-2.5">
            <h1 className="text-xl font-extrabold tracking-tight">Mend</h1>
            <SyncBadge />
          </div>
          <Tabs.List
            aria-label="Sections"
            className="hidden gap-1 rounded-(--radius-control) border border-line bg-surface-2 p-1 lg:flex"
          >
            {TAB_ITEMS.map(({ value, label, icon: TabIcon }) => (
              <Tabs.Trigger
                key={value}
                value={value}
                className="inline-flex min-h-9 items-center gap-1.5 rounded-[calc(var(--radius-control)-2px)] px-3 text-sm font-medium text-muted transition data-[state=active]:bg-surface data-[state=active]:text-accent data-[state=active]:shadow-sm"
              >
                <TabIcon className="size-4" />
                {label}
              </Tabs.Trigger>
            ))}
          </Tabs.List>
          <IconButton label="Settings" onClick={() => setSettingsOpen(true)}>
            <GearIcon className="size-5" />
          </IconButton>
        </header>

        {migrating ? (
          <p className="mb-3 rounded-(--radius-control) bg-accent-soft p-3 text-sm text-accent">
            Upgrading your household data — one moment…
          </p>
        ) : null}

        {demoMode ? (
          <p className="mb-3 rounded-(--radius-control) border border-warn/30 bg-surface p-3 text-xs text-muted">
            <span className="font-semibold text-warn">Preview build</span> —
            sample data, no sign-in, changes aren't saved.
          </p>
        ) : null}

        <main className="flex-1">
          <Tabs.Content value="today" className="focus:outline-none">
            <TodayTab />
          </Tabs.Content>
          <Tabs.Content value="meds" className="focus:outline-none">
            <MedsTab />
          </Tabs.Content>
          <Tabs.Content value="calendar" className="focus:outline-none">
            <CalendarTab />
          </Tabs.Content>
          <Tabs.Content value="progress" className="focus:outline-none">
            <ProgressTab />
          </Tabs.Content>
          <Tabs.Content value="guide" className="focus:outline-none">
            <GuideTab />
          </Tabs.Content>
        </main>
      </div>

      <Tabs.List
        aria-label="Sections"
        className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 backdrop-blur lg:hidden"
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      >
        <div className="mx-auto flex max-w-lg">
          {TAB_ITEMS.map(({ value, label, icon: TabIcon }) => (
            <Tabs.Trigger
              key={value}
              value={value}
              className="flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-xs font-medium text-muted transition data-[state=active]:text-accent"
            >
              <TabIcon className="size-5" />
              {label}
            </Tabs.Trigger>
          ))}
        </div>
      </Tabs.List>

      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
    </Tabs.Root>
  );
}

function InvitePrompt() {
  const user = useStore((s) => s.user);
  const pendingInvite = useStore((s) => s.pendingInvite);
  const setPendingInvite = useStore((s) => s.setPendingInvite);

  return (
    <ConfirmDialog
      open={user !== null && pendingInvite !== null}
      onOpenChange={(o) => {
        if (!o) setPendingInvite(null);
      }}
      title="Join household?"
      body="You've been invited to a shared Mend household. Joining lets you both see and log the same recovery record — meds, PT sessions, and appointments."
      confirmLabel="Join household"
      onConfirm={() => {
        redeemPendingInvite()
          .then(() => toast('Joined household', 'Data is now syncing.'))
          .catch((err) =>
            toastError(
              'Could not join',
              err instanceof Error ? err.message : 'Try again.',
            ),
          );
      }}
    />
  );
}

export default function App() {
  const user = useStore((s) => s.user);
  const authReady = useStore((s) => s.authReady);

  return (
    <>
      {!authReady ? (
        <main className="flex min-h-dvh items-center justify-center">
          <span className="text-sm text-muted">Loading…</span>
        </main>
      ) : user ? (
        <AppShell />
      ) : (
        <SignInScreen />
      )}
      <InvitePrompt />
      <Toaster />
      <UpdatePrompt />
    </>
  );
}

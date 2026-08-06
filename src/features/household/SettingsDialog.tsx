import { useState } from 'react';
import { useStore } from '../../store/useStore';
import { leaveCurrentHousehold, signOutUser } from '../../store/auth';
import {
  createInvite,
  removeMember,
  saveInjury,
  setAgentGrant,
} from '../../store/sync';
import { applyTheme, getTheme, type ThemeChoice } from '../../lib/theme';
import { ConfirmDialog, Dialog } from '../../components/ui/Dialog';
import { Button, IconButton } from '../../components/ui/Button';
import { Switch } from '../../components/ui/Switch';
import { SectionLabel } from '../../components/ui/Card';
import { Field, TextInput } from '../../components/ui/Field';
import { toast, toastError } from '../../components/ui/Toast';
import { TrashIcon } from '../../components/icons';
import { isNotifyEnabled, setNotifyEnabled } from '../../lib/notify';
import { needsIosInstallHint, promptInstall } from '../../lib/install';
import { doseLogCsv, downloadFile, householdExportJson } from '../../lib/export';
import { readStore } from '../../store/useStore';
import { todayKey } from '../../lib/dates';
import { GcalSection } from './GcalSection';

function InjurySection() {
  const injury = useStore((s) => s.injury);
  const [editOpen, setEditOpen] = useState(false);
  const [title, setTitle] = useState(injury.title);
  const [occurredOn, setOccurredOn] = useState(injury.occurredOn);
  const [mechanism, setMechanism] = useState(injury.mechanism);
  const [diagnosis, setDiagnosis] = useState(injury.diagnosis);
  const [surgeryOn, setSurgeryOn] = useState(injury.surgeryOn ?? '');

  const openEditor = () => {
    setTitle(injury.title);
    setOccurredOn(injury.occurredOn);
    setMechanism(injury.mechanism);
    setDiagnosis(injury.diagnosis);
    setSurgeryOn(injury.surgeryOn ?? '');
    setEditOpen(true);
  };

  return (
    <section aria-label="Injury" className="space-y-3">
      <SectionLabel>Injury</SectionLabel>
      {injury.title ? (
        <div className="text-sm">
          <span className="block font-medium">{injury.title}</span>
          <span className="block text-xs text-muted">
            {injury.occurredOn ? `Since ${injury.occurredOn}` : 'Date not set'}
            {injury.diagnosis ? ` · ${injury.diagnosis}` : ''}
          </span>
        </div>
      ) : (
        <p className="text-xs text-muted">
          No injury profile yet — progress charts need a day zero.
        </p>
      )}
      <Button variant="outline" onClick={openEditor}>
        {injury.title ? 'Edit injury profile' : 'Set up injury profile'}
      </Button>

      <Dialog
        open={editOpen}
        onOpenChange={setEditOpen}
        title="Injury profile"
        description="The anchor for the whole record: what happened and when."
      >
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            saveInjury({
              title: title.trim(),
              occurredOn,
              mechanism: mechanism.trim(),
              diagnosis: diagnosis.trim(),
              surgeryOn: surgeryOn || null,
            })
              .then(() => {
                setEditOpen(false);
                toast('Injury profile saved');
              })
              .catch(() => toastError('Not synced', 'Try again.'));
          }}
        >
          <Field label="Title">
            <TextInput
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Right knee — MCL sprain"
              required
            />
          </Field>
          <Field label="Injury date">
            <TextInput
              type="date"
              value={occurredOn}
              onChange={(e) => setOccurredOn(e.target.value)}
              required
            />
          </Field>
          <Field label="How it happened">
            <TextInput
              value={mechanism}
              onChange={(e) => setMechanism(e.target.value)}
              placeholder="Twisted landing a box jump"
            />
          </Field>
          <Field label="Diagnosis">
            <TextInput
              value={diagnosis}
              onChange={(e) => setDiagnosis(e.target.value)}
              placeholder="Grade 2 MCL sprain"
            />
          </Field>
          <Field label="Surgery date" hint="Leave empty if no surgery.">
            <TextInput
              type="date"
              value={surgeryOn}
              onChange={(e) => setSurgeryOn(e.target.value)}
            />
          </Field>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" onClick={() => setEditOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" type="submit">
              Save
            </Button>
          </div>
        </form>
      </Dialog>
    </section>
  );
}

export function SettingsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const user = useStore((s) => s.user);
  const members = useStore((s) => s.members);
  const ownerUid = useStore((s) => s.ownerUid);
  const installAvailable = useStore((s) => s.installAvailable);
  const agents = useStore((s) => s.agents);
  const [agentUid, setAgentUid] = useState('');
  const [inviting, setInviting] = useState(false);
  const [removeUid, setRemoveUid] = useState<string | null>(null);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [theme, setTheme] = useState<ThemeChoice>(getTheme());
  const [notify, setNotify] = useState(isNotifyEnabled());

  const isOwner = user !== null && ownerUid === user.uid;

  const invite = async () => {
    setInviting(true);
    try {
      const inv = await createInvite();
      const shared = typeof navigator.share === 'function'
        ? await navigator.share({ title: 'Join my Mend household', url: inv.url })
            .then(() => true)
            .catch(() => false)
        : false;
      if (!shared) {
        await navigator.clipboard.writeText(inv.url);
        toast('Invite link copied', 'Single-use, expires in 72 hours.');
      } else {
        toast('Invite link shared', 'Single-use, expires in 72 hours.');
      }
    } catch (err) {
      console.error(err);
      toastError('Could not create invite', 'Check your connection and try again.');
    } finally {
      setInviting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Settings">
      <div className="space-y-5">
        <InjurySection />

        <section aria-label="Household" className="space-y-3">
          <SectionLabel>Household</SectionLabel>
          <ul className="space-y-1.5">
            {Object.entries(members).map(([uid, m]) => {
              const isSelf = uid === user?.uid;
              return (
                <li
                  key={uid}
                  className="flex min-h-11 items-center justify-between gap-2 rounded-(--radius-control) bg-surface-2 px-3 py-1.5 text-sm"
                >
                  <span className="min-w-0">
                    <span className="block truncate">
                      {m.email || uid}
                      {isSelf ? <span className="text-muted"> (you)</span> : null}
                    </span>
                    <span className="block text-xs text-muted">
                      {uid === ownerUid ? 'Owner' : 'Member'}
                      {m.joinedAt
                        ? ` · joined ${new Date(m.joinedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
                        : ''}
                    </span>
                  </span>
                  {isOwner && !isSelf ? (
                    <IconButton
                      label={`Remove ${m.email || 'member'}`}
                      className="!size-9 shrink-0"
                      onClick={() => setRemoveUid(uid)}
                    >
                      <TrashIcon className="size-4" />
                    </IconButton>
                  ) : null}
                </li>
              );
            })}
          </ul>
          <div className="flex gap-2">
            <Button
              variant="outline"
              className="flex-1"
              disabled={inviting}
              onClick={() => void invite()}
            >
              {inviting ? 'Creating…' : 'Invite someone'}
            </Button>
            {!isOwner ? (
              <Button variant="danger" onClick={() => setLeaveOpen(true)}>
                Leave
              </Button>
            ) : null}
          </div>
          <p className="text-xs text-muted">
            Invite links are single-use and expire after 72 hours. Everyone in
            the household shares the same recovery record.
          </p>
        </section>

        <section aria-label="Appearance" className="space-y-3">
          <SectionLabel>Appearance</SectionLabel>
          <div className="flex gap-2" role="radiogroup" aria-label="Theme">
            {(['system', 'light', 'dark'] as const).map((choice) => (
              <button
                key={choice}
                type="button"
                role="radio"
                aria-checked={theme === choice}
                onClick={() => {
                  setTheme(choice);
                  applyTheme(choice);
                }}
                className={`min-h-10 flex-1 rounded-(--radius-control) border px-3 text-sm font-medium capitalize transition ${
                  theme === choice
                    ? 'border-accent-strong bg-accent-soft text-accent'
                    : 'border-line bg-surface-2 text-muted hover:text-ink'
                }`}
              >
                {choice}
              </button>
            ))}
          </div>
        </section>

        <section aria-label="Notifications" className="space-y-3">
          <SectionLabel>Notifications</SectionLabel>
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="text-muted">
              In-app reminders
              <span className="block text-xs">
                Notifies on this device while the app is open. For dose alarms
                that fire with the app closed, use your phone's alarm for now.
              </span>
            </span>
            <Switch
              checked={notify}
              onCheckedChange={(on) => {
                void setNotifyEnabled(on).then((granted) => {
                  setNotify(granted);
                  if (on && !granted)
                    toastError(
                      'Notifications blocked',
                      'Allow notifications for this site in your browser settings.',
                    );
                });
              }}
              label="In-app reminder notifications"
            />
          </div>
        </section>

        <GcalSection />

        <section aria-label="Hermes agent" className="space-y-3">
          <SectionLabel>Hermes agent</SectionLabel>
          {Object.keys(agents).length > 0 ? (
            <ul className="space-y-1.5">
              {Object.keys(agents).map((uid) => (
                <li
                  key={uid}
                  className="flex min-h-10 items-center justify-between gap-2 rounded-(--radius-control) bg-surface-2 px-3 py-1 text-xs"
                >
                  <code className="truncate">{uid}</code>
                  <Button
                    variant="ghost"
                    className="!min-h-8 text-danger"
                    onClick={() =>
                      setAgentGrant(uid, false).catch(() =>
                        toastError('Not synced'),
                      )
                    }
                  >
                    Revoke
                  </Button>
                </li>
              ))}
            </ul>
          ) : null}
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              const v = agentUid.trim();
              if (!v) return;
              setAgentGrant(v, true)
                .then(() => {
                  setAgentUid('');
                  toast('Agent granted', 'It can now drop suggestions in the inbox.');
                })
                .catch(() => toastError('Not synced'));
            }}
          >
            <label htmlFor="agent-uid" className="sr-only">
              Agent account UID
            </label>
            <input
              id="agent-uid"
              value={agentUid}
              onChange={(e) => setAgentUid(e.target.value)}
              placeholder="Agent account UID"
              className="min-h-11 min-w-0 flex-1 rounded-(--radius-control) border border-line bg-surface-2 px-3 font-mono text-xs"
            />
            <Button type="submit" disabled={!agentUid.trim()}>
              Grant
            </Button>
          </form>
          <p className="text-xs text-muted">
            Lets the Hermes agent drop dictated PT sessions and dose logs into
            the inbox as suggestions. Agents can only write suggestions — a
            person always reviews and applies them.
          </p>
        </section>

        {installAvailable || needsIosInstallHint() ? (
          <section aria-label="App" className="space-y-3">
            <SectionLabel>App</SectionLabel>
            {installAvailable ? (
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="text-muted">Install Mend on this device</span>
                <Button variant="outline" onClick={() => void promptInstall()}>
                  Install
                </Button>
              </div>
            ) : (
              <p className="text-xs text-muted">
                To install on iPhone: open the Share menu in Safari and choose
                “Add to Home Screen.”
              </p>
            )}
          </section>
        ) : null}

        <section aria-label="Export" className="space-y-3">
          <SectionLabel>Export</SectionLabel>
          <div className="flex gap-2">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => {
                const s = readStore();
                downloadFile(
                  householdExportJson(
                    {
                      injury: s.injury,
                      meds: s.meds,
                      doses: s.doses,
                      ptSessions: s.ptSessions,
                      metrics: s.metrics,
                      appointments: s.appointments,
                      hep: s.hep,
                    },
                    Date.now(),
                  ),
                  `mend-export-${todayKey()}.json`,
                  'application/json',
                );
              }}
            >
              Full record (JSON)
            </Button>
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => {
                const s = readStore();
                downloadFile(
                  doseLogCsv(s.meds, s.doses),
                  `mend-doses-${todayKey()}.csv`,
                  'text/csv',
                );
              }}
            >
              Dose log (CSV)
            </Button>
          </div>
          <p className="text-xs text-muted">
            The record's value outlives the recovery — export before you stop
            using the app daily.
          </p>
        </section>

        <section aria-label="Account" className="space-y-3">
          <SectionLabel>Account</SectionLabel>
          <div className="flex items-center justify-between gap-2 text-sm">
            <span className="truncate text-muted">{user?.email}</span>
            <Button variant="danger" onClick={() => void signOutUser()}>
              Sign out
            </Button>
          </div>
        </section>
      </div>

      <ConfirmDialog
        open={removeUid !== null}
        onOpenChange={(o) => {
          if (!o) setRemoveUid(null);
        }}
        title="Remove this member?"
        body="They immediately lose access to the shared recovery record. Nothing they entered is deleted."
        confirmLabel="Remove"
        danger
        onConfirm={() => {
          if (removeUid)
            removeMember(removeUid)
              .then(() => toast('Member removed'))
              .catch(() => toastError('Not synced', 'Try again.'));
          setRemoveUid(null);
        }}
      />
      <ConfirmDialog
        open={leaveOpen}
        onOpenChange={setLeaveOpen}
        title="Leave this household?"
        body="You'll switch to your own empty household. The shared record stays with the other members."
        confirmLabel="Leave household"
        danger
        onConfirm={() => {
          leaveCurrentHousehold()
            .then(() => toast('Left household'))
            .catch(() => toastError('Could not leave', 'Try again.'));
        }}
      />
    </Dialog>
  );
}

import { useState } from 'react';
import { useStore } from '../../store/useStore';
import { saveGcalSettings } from '../../store/sync';
import { runGcalSync } from '../../store/gcalSync';
import {
  isGcalConfigured,
  listCalendars,
  requestAccessToken,
  type GcalCalendar,
} from '../../lib/gcal';
import { SectionLabel } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Field, TextInput } from '../../components/ui/Field';
import { toast, toastError } from '../../components/ui/Toast';

/** Settings → Google Calendar: connect, pick calendars, keyword filter,
 * manual sync. Read-only scope; connecting is deliberately separate from
 * Firebase sign-in. */
export function GcalSection() {
  const gcal = useStore((s) => s.settings.gcal);
  const gcalStatus = useStore((s) => s.gcalStatus);
  const user = useStore((s) => s.user);
  const [calendars, setCalendars] = useState<GcalCalendar[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [keywordsText, setKeywordsText] = useState<string | null>(null);

  if (!isGcalConfigured()) {
    return (
      <section aria-label="Google Calendar" className="space-y-3">
        <SectionLabel>Google Calendar</SectionLabel>
        <p className="text-xs text-muted">
          Appointment sync switches on once the Google Cloud OAuth client is
          created (a console step for later). Manual appointments work now.
        </p>
      </section>
    );
  }

  const connect = async () => {
    setBusy(true);
    try {
      await requestAccessToken(true);
      const cals = await listCalendars();
      setCalendars(cals);
      if (user && gcal.connectedEmail !== user.email) {
        await saveGcalSettings({ connectedEmail: user.email });
      }
      toast('Google Calendar connected', 'Pick which calendars to pull from.');
    } catch (err) {
      toastError(
        'Could not connect',
        err instanceof Error ? err.message : 'Try again.',
      );
    } finally {
      setBusy(false);
    }
  };

  const toggleCalendar = (id: string) => {
    const next = gcal.calendarIds.includes(id)
      ? gcal.calendarIds.filter((c) => c !== id)
      : [...gcal.calendarIds, id];
    saveGcalSettings({ calendarIds: next }).catch(() => toastError('Not synced'));
  };

  const commitKeywords = () => {
    if (keywordsText === null) return;
    const keywords = keywordsText
      .split(',')
      .map((k) => k.trim())
      .filter(Boolean);
    setKeywordsText(null);
    if (keywords.length) {
      saveGcalSettings({ keywords }).catch(() => toastError('Not synced'));
    }
  };

  return (
    <section aria-label="Google Calendar" className="space-y-3">
      <SectionLabel>Google Calendar</SectionLabel>

      {gcal.connectedEmail ? (
        <p className="text-xs text-muted">
          Connected as {gcal.connectedEmail}
          {gcalStatus === 'reconnect' ? (
            <span className="font-semibold text-warn"> — access expired, reconnect below.</span>
          ) : null}
        </p>
      ) : (
        <p className="text-xs text-muted">
          Pulls medical appointments (matched by keywords) into the calendar.
          Read-only — Mend never changes your Google Calendar.
        </p>
      )}

      <div className="flex gap-2">
        <Button variant="outline" className="flex-1" disabled={busy} onClick={() => void connect()}>
          {busy ? 'Connecting…' : gcal.connectedEmail ? 'Reconnect' : 'Connect Google Calendar'}
        </Button>
        {gcal.calendarIds.length > 0 ? (
          <Button
            variant="outline"
            disabled={gcalStatus === 'syncing'}
            onClick={() =>
              runGcalSync(true)
                .then(() => toast('Calendar synced'))
                .catch(() => toastError('Sync failed', 'Try reconnecting.'))
            }
          >
            {gcalStatus === 'syncing' ? 'Syncing…' : 'Sync now'}
          </Button>
        ) : null}
      </div>

      {calendars ? (
        <ul className="space-y-1">
          {calendars.map((c) => (
            <li key={c.id}>
              <label className="flex min-h-10 cursor-pointer items-center gap-2.5 rounded-(--radius-control) bg-surface-2 px-3 text-sm">
                <input
                  type="checkbox"
                  checked={gcal.calendarIds.includes(c.id)}
                  onChange={() => toggleCalendar(c.id)}
                  className="size-4 accent-(--accent-strong)"
                />
                <span className="truncate">
                  {c.summary}
                  {c.primary ? <span className="text-muted"> (primary)</span> : null}
                </span>
              </label>
            </li>
          ))}
        </ul>
      ) : gcal.calendarIds.length > 0 ? (
        <p className="text-xs text-muted">
          {gcal.calendarIds.length} calendar{gcal.calendarIds.length === 1 ? '' : 's'} selected.
          Reconnect to change the selection.
        </p>
      ) : null}

      <Field
        label="Medical keywords"
        hint="Events whose title contains any of these count as medical. Comma-separated."
      >
        <TextInput
          value={keywordsText ?? gcal.keywords.join(', ')}
          onChange={(e) => setKeywordsText(e.target.value)}
          onBlur={commitKeywords}
          placeholder="PT, Dr., MRI, ortho"
        />
      </Field>
    </section>
  );
}

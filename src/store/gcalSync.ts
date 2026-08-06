// Google Calendar sync orchestration: fetch matching events for the
// selected calendars and merge them into appointments. Runs on app open
// and on manual refresh — no server, so no background sync.

import { patchStore, readStore } from './useStore';
import { applyGcalMerge } from './sync';
import { isGcalConfigured, listEvents, requestAccessToken } from '../lib/gcal';
import { mergeGcalEvents } from '../lib/gcalMerge';
import { addDays, parseDateKey, todayKey } from '../lib/dates';

const PAST_DAYS_FALLBACK = 30;
const FUTURE_DAYS = 90;

let syncing = false;

/** Sync now. interactive=true comes from an explicit user tap (consent
 * popup allowed); false = silent app-open sync (failure → reconnect chip). */
export async function runGcalSync(interactive = false): Promise<void> {
  const { settings, injury, user, demoMode } = readStore();
  const gcal = settings.gcal;
  if (!isGcalConfigured() || demoMode || !user) return;
  if (gcal.calendarIds.length === 0) return;
  if (syncing) return;

  syncing = true;
  patchStore({ gcalStatus: 'syncing' });
  try {
    await requestAccessToken(interactive);

    const fromKey = injury.occurredOn || addDays(todayKey(), -PAST_DAYS_FALLBACK);
    const windowStart = parseDateKey(fromKey).getTime();
    const windowEnd = parseDateKey(addDays(todayKey(), FUTURE_DAYS)).getTime();

    const rawEvents = (
      await Promise.all(
        gcal.calendarIds.map((id) =>
          listEvents(id, new Date(windowStart).toISOString(), new Date(windowEnd).toISOString()),
        ),
      )
    ).flat();

    const updates = mergeGcalEvents(
      readStore().appointments,
      rawEvents,
      windowStart,
      windowEnd,
      gcal,
    );
    await applyGcalMerge(updates);
    patchStore({ gcalStatus: 'ok' });
  } catch (err) {
    console.error('Calendar sync failed:', err);
    // Silent-token failure or expired testing-mode grant → reconnect chip.
    patchStore({ gcalStatus: 'reconnect' });
    if (interactive) throw err;
  } finally {
    syncing = false;
  }
}

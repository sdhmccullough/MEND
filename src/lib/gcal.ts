// Google Calendar read-only access via Google Identity Services (token
// client) + plain-fetch REST. Deliberately separate from Firebase sign-in:
// connecting the calendar is an explicit Settings action.
//
// The OAuth app runs in Testing mode (two users, no verification): grants
// expire every ~7 days, so silent token requests fail eventually and the
// UI surfaces a "reconnect" chip instead of failing silently.
//
// Dedicated web OAuth client ("Mend calendar"), separate from the one
// Firebase auto-created for sign-in. Origin-restricted, not a secret; its
// Authorized JavaScript origins must list https://mend-467f5.web.app (and
// http://localhost:5173 for dev).

export const GCAL_CLIENT_ID =
  '238537262774-6iu5qtqjt3muk4hniq3q533ohtu2459q.apps.googleusercontent.com';
const SCOPE = 'https://www.googleapis.com/auth/calendar.readonly';
const API = 'https://www.googleapis.com/calendar/v3';

export function isGcalConfigured(): boolean {
  return !GCAL_CLIENT_ID.startsWith('MEND_');
}

// ---- GIS loading -----------------------------------------------------------

interface TokenResponse {
  access_token?: string;
  expires_in?: number;
  error?: string;
}

interface TokenClient {
  requestAccessToken: (opts?: { prompt?: string }) => void;
  callback: (resp: TokenResponse) => void;
}

interface GisGlobal {
  accounts?: {
    oauth2?: {
      initTokenClient: (cfg: {
        client_id: string;
        scope: string;
        callback: (resp: TokenResponse) => void;
      }) => TokenClient;
    };
  };
}

let gisPromise: Promise<void> | null = null;

function loadGis(): Promise<void> {
  if (gisPromise) return gisPromise;
  gisPromise = new Promise((resolve, reject) => {
    if ((window as { google?: GisGlobal }).google?.accounts?.oauth2) {
      resolve();
      return;
    }
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => {
      gisPromise = null;
      reject(new Error('Could not load Google sign-in script.'));
    };
    document.head.appendChild(s);
  });
  return gisPromise;
}

// Token lives in memory only — never persisted.
let accessToken: string | null = null;
let tokenExpiresAt = 0;

export function hasLiveToken(): boolean {
  return accessToken !== null && Date.now() < tokenExpiresAt - 60_000;
}

/** Get an access token. interactive=true shows the Google consent popup;
 * interactive=false attempts a silent grant and rejects if one is needed
 * (the caller shows the reconnect chip). */
export async function requestAccessToken(interactive: boolean): Promise<string> {
  if (hasLiveToken()) return accessToken as string;
  await loadGis();
  const oauth2 = (window as { google?: GisGlobal }).google?.accounts?.oauth2;
  if (!oauth2) throw new Error('Google sign-in unavailable.');

  return new Promise<string>((resolve, reject) => {
    const client = oauth2.initTokenClient({
      client_id: GCAL_CLIENT_ID,
      scope: SCOPE,
      callback: (resp) => {
        if (resp.error || !resp.access_token) {
          reject(new Error(resp.error ?? 'No token returned.'));
          return;
        }
        accessToken = resp.access_token;
        tokenExpiresAt = Date.now() + (resp.expires_in ?? 3600) * 1000;
        resolve(resp.access_token);
      },
    });
    client.requestAccessToken({ prompt: interactive ? 'consent' : '' });
  });
}

export function dropToken(): void {
  accessToken = null;
  tokenExpiresAt = 0;
}

// ---- REST ------------------------------------------------------------------

async function gcalGet<T>(path: string, params: Record<string, string>): Promise<T> {
  const token = accessToken;
  if (!token) throw new Error('Not connected to Google Calendar.');
  const qs = new URLSearchParams(params).toString();
  const res = await fetch(`${API}${path}?${qs}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status === 401 || res.status === 403) {
    dropToken();
    throw new Error('Google Calendar access expired — reconnect in Settings.');
  }
  if (!res.ok) throw new Error(`Calendar request failed (${res.status}).`);
  return (await res.json()) as T;
}

export interface GcalCalendar {
  id: string;
  summary: string;
  primary?: boolean;
}

export async function listCalendars(): Promise<GcalCalendar[]> {
  const data = await gcalGet<{ items?: GcalCalendar[] }>('/users/me/calendarList', {
    minAccessRole: 'reader',
    fields: 'items(id,summary,primary)',
  });
  return data.items ?? [];
}

/** Raw event shape as returned by the API (subset we use). Parsing to app
 * values happens in lib/gcalMerge.ts, which is pure and tested. */
export interface GcalRawEvent {
  id: string;
  status?: string;
  summary?: string;
  location?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
}

export async function listEvents(
  calendarId: string,
  timeMinIso: string,
  timeMaxIso: string,
): Promise<GcalRawEvent[]> {
  const out: GcalRawEvent[] = [];
  let pageToken = '';
  do {
    const data = await gcalGet<{ items?: GcalRawEvent[]; nextPageToken?: string }>(
      `/calendars/${encodeURIComponent(calendarId)}/events`,
      {
        timeMin: timeMinIso,
        timeMax: timeMaxIso,
        singleEvents: 'true',
        orderBy: 'startTime',
        maxResults: '250',
        fields: 'items(id,status,summary,location,start,end),nextPageToken',
        ...(pageToken ? { pageToken } : {}),
      },
    );
    out.push(...(data.items ?? []));
    pageToken = data.nextPageToken ?? '';
  } while (pageToken);
  return out;
}

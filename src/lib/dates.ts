// Date helpers. All keys use the LOCAL calendar date — never
// toISOString(), which converts to UTC first and shifts the date across
// midnight for UTC+ timezones (the source of PayDay's v1 week-wipe bug).

export function toLocalDateKey(d: Date): string {
  return (
    d.getFullYear() +
    '-' +
    String(d.getMonth() + 1).padStart(2, '0') +
    '-' +
    String(d.getDate()).padStart(2, '0')
  );
}

export function todayKey(now = new Date()): string {
  return toLocalDateKey(now);
}

export function parseDateKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** dateKey shifted by `n` calendar days (n may be negative). */
export function addDays(key: string, n: number): string {
  const d = parseDateKey(key);
  d.setDate(d.getDate() + n);
  return toLocalDateKey(d);
}

/** Inclusive range of dateKeys from `from` to `to`; [] when to < from. */
export function dateKeyRange(from: string, to: string): string[] {
  const keys: string[] = [];
  for (let k = from; k <= to; k = addDays(k, 1)) {
    keys.push(k);
    if (keys.length > 1000) break; // guard against inverted/garbage input
  }
  return keys;
}

export interface MonthCell {
  dateKey: string;
  inMonth: boolean;
}

/** 42-cell month grid (6 weeks, Sunday-first) for `year`/`month0`. */
export function monthGrid(year: number, month0: number): MonthCell[] {
  const first = new Date(year, month0, 1);
  const start = new Date(first);
  start.setDate(1 - first.getDay()); // back to the Sunday on/before the 1st
  const cells: MonthCell[] = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    cells.push({ dateKey: toLocalDateKey(d), inMonth: d.getMonth() === month0 });
  }
  return cells;
}

export function monthLabel(year: number, month0: number): string {
  return new Date(year, month0, 1).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  });
}

export function formatShort(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function formatFull(d: Date): string {
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/** Weekday + date, e.g. "Wed, Aug 6" — day-view headers. */
export function formatDayHeading(key: string): string {
  return parseDateKey(key).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

/** Current local time as "HH:MM". */
export function nowHHMM(d = new Date()): string {
  return (
    String(d.getHours()).padStart(2, '0') +
    ':' +
    String(d.getMinutes()).padStart(2, '0')
  );
}

/** "HH:MM" → "7:58 AM" for display. */
export function formatHHMM12(hhmm: string): string {
  if (!hhmm) return '';
  const [h, m] = hhmm.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${period}`;
}

/** Epoch ms → "7:58 AM" local. */
export function formatEpochTime(ms: number): string {
  return new Date(ms).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  });
}

/** Epoch ms → local dateKey. */
export function epochToDateKey(ms: number): string {
  return toLocalDateKey(new Date(ms));
}

/** Minutes between two "HH:MM" strings; negative clamps to 0. */
export function minutesBetween(start: string, end: string): number {
  if (!start || !end) return 0;
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  const diff = eh * 60 + em - (sh * 60 + sm);
  return diff > 0 ? diff : 0;
}

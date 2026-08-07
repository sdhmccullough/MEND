import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildBackfillUpdates } from '../src/lib/backfill';
import { interpretInboxItem } from '../src/lib/inboxApply';
import type { InboxItem, Med } from '../src/lib/schema';

// Nodes closed with `"$other": { ".validate": false }` reject any field the
// rules don't name — silently, as a permission error at runtime. A timer
// write once carried a `by` the rules didn't list, and the only symptom
// was a red "Not synced" toast. These tests keep the writers and the rules
// honest with each other.

interface RuleNode {
  [key: string]: RuleNode | boolean | string | undefined;
}

function closedShapes(): Record<string, string[]> {
  const rules = JSON.parse(readFileSync('database.rules.json', 'utf8')).rules as RuleNode;
  const found: Record<string, string[]> = {};
  const walk = (node: unknown, path: string) => {
    if (typeof node !== 'object' || node === null) return;
    const obj = node as RuleNode;
    const other = obj.$other as RuleNode | undefined;
    if (other && other['.validate'] === false) {
      found[path] = Object.keys(obj).filter((k) => !k.startsWith('.') && k !== '$other');
    }
    for (const [k, v] of Object.entries(obj)) walk(v, `${path}/${k}`);
  };
  walk(rules, '');
  return found;
}

const SHAPES = closedShapes();
const DOSE_PATH = '/households/$hid/doses/$dateKey/$doseId';

/** Field lists the app writes. Keep in sync with the writers in
 * store/sync.ts — a mismatch here means a runtime permission error. */
const WRITER_FIELDS: Record<string, string[]> = {
  '/households/$hid/timers/$routineId': ['label', 'startedAt', 'dueAt', 'notifiedAt', 'by'],
  '/households/$hid/routineLogs/$dateKey/$logId': ['routineId', 'at', 'by'],
  '/households/$hid/photos/$dateKey/$photoId': ['url', 'path', 'by', 'at'],
  '/households/$hid/spacing/$ruleId': ['medA', 'medB', 'hours', 'note'],
  '/households/$hid/inbox/$id': ['type', 'receivedAt', 'status', 'payload'],
};

describe('closed-shape rules match what the app writes', () => {
  it.each(Object.keys(WRITER_FIELDS))('%s accepts every field written', (path) => {
    const allowed = SHAPES[path];
    expect(allowed, `no closed shape found at ${path}`).toBeDefined();
    for (const field of WRITER_FIELDS[path]) {
      expect(allowed, `rules reject "${field}"`).toContain(field);
    }
  });

  it('backfilled dose records only use allowed fields', () => {
    const updates = buildBackfillUpdates(
      'med1',
      [{ dateKey: '2026-08-05', slot: '08:00', status: 'taken' }],
      'uid1',
    );
    const record = Object.values(updates)[0] as unknown as Record<string, unknown>;
    for (const field of Object.keys(record)) {
      expect(SHAPES[DOSE_PATH], `rules reject "${field}"`).toContain(field);
    }
  });

  it('inbox-applied dose records only use allowed fields', () => {
    const med: Med = {
      name: 'Naproxen',
      doseText: '',
      form: '',
      purpose: '',
      prescriber: '',
      schedule: {
        kind: 'times',
        times: ['08:00'],
        everyHours: null,
        startOn: '2026-08-01',
        endOn: null,
        taper: [],
      },
      active: true,
      notes: '',
      refills: null,
      noDriving: false,
      variableDose: false,
      fillQuantity: null,
      filledOn: null,
    };
    const item: InboxItem = {
      type: 'doseLog',
      payload: { medName: 'Naproxen', slot: '08:00' },
      receivedAt: Date.now(),
      status: 'pending',
    };
    const out = interpretInboxItem('x', item, { meds: { m1: med }, uid: 'u', now: Date.now() });
    if (!out.ok) throw new Error('expected a valid interpretation');
    const record = Object.values(out.updates)[0] as Record<string, unknown>;
    for (const field of Object.keys(record)) {
      expect(SHAPES[DOSE_PATH], `rules reject "${field}"`).toContain(field);
    }
  });
});

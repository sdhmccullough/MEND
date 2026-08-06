import { describe, expect, it } from 'vitest';
import { interpretInboxItem, resolveMed } from '../src/lib/inboxApply';
import type { InboxItem, Med, PtSession } from '../src/lib/schema';

const NAPROXEN: Med = {
  name: 'Naproxen',
  doseText: '500 mg',
  form: 'tablet',
  purpose: '',
  prescriber: '',
  schedule: {
    kind: 'times',
    times: ['08:00', '20:00'],
    everyHours: null,
    startOn: '2026-08-01',
    endOn: null,
    taper: [],
  },
  active: true,
  notes: '',
  refills: null,
};

const CTX = {
  meds: { med1: NAPROXEN },
  uid: 'applier',
  now: new Date(2026, 7, 6, 12, 0).getTime(),
};

function item(type: InboxItem['type'], payload: unknown): InboxItem {
  return {
    type,
    payload,
    receivedAt: new Date(2026, 7, 6, 11, 0).getTime(),
    status: 'pending',
  };
}

describe('interpretInboxItem — ptSession', () => {
  it('builds a hermes-sourced session at a deterministic path', () => {
    const out = interpretInboxItem(
      'abc',
      item('ptSession', {
        kind: 'home',
        exercises: [{ name: 'Quad sets', sets: 3, reps: 15 }],
        painPre: 6,
        painPost: 3,
      }),
      CTX,
    );
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    const session = out.updates['ptSessions/pt_abc'] as PtSession;
    expect(session).toMatchObject({ kind: 'home', source: 'hermes', by: 'applier' });
    expect(session.exercises).toHaveLength(1);
    expect(out.summary).toContain('pain 6→3');
  });

  it('is idempotent — same id, same path', () => {
    const payload = item('ptSession', { exercises: [{ name: 'X' }] });
    const a = interpretInboxItem('same', payload, CTX);
    const b = interpretInboxItem('same', payload, CTX);
    expect(a).toEqual(b);
  });

  it('rejects a session with no usable exercises', () => {
    const out = interpretInboxItem('x', item('ptSession', { exercises: [{}] }), CTX);
    expect(out).toMatchObject({ ok: false });
  });

  it('clamps out-of-range pain', () => {
    const out = interpretInboxItem(
      'x',
      item('ptSession', { exercises: [{ name: 'X' }], painPre: 14, painPost: -2 }),
      CTX,
    );
    if (!out.ok) throw new Error('expected ok');
    const session = out.updates['ptSessions/pt_x'] as PtSession;
    expect(session.painPre).toBe(10);
    expect(session.painPost).toBe(0);
  });
});

describe('interpretInboxItem — doseLog', () => {
  it('resolves the med by name and converges on the slot record', () => {
    const out = interpretInboxItem(
      'd1',
      item('doseLog', { medName: 'naproxen', slot: '08:00', dateKey: '2026-08-06' }),
      CTX,
    );
    if (!out.ok) throw new Error('expected ok');
    expect(Object.keys(out.updates)).toEqual(['doses/2026-08-06/med1_0800']);
    expect(out.summary).toContain('Naproxen');
  });

  it('slotless doses land on a prn path dated from takenAt', () => {
    const at = new Date(2026, 7, 5, 21, 30).getTime();
    const out = interpretInboxItem('d2', item('doseLog', { medName: 'Naproxen', at }), CTX);
    if (!out.ok) throw new Error('expected ok');
    expect(Object.keys(out.updates)).toEqual(['doses/2026-08-05/prn_inbox_d2']);
  });

  it('rejects unknown and ambiguous med names', () => {
    expect(interpretInboxItem('x', item('doseLog', { medName: 'Advil' }), CTX)).toMatchObject({
      ok: false,
    });
    const two = { ...CTX, meds: { a: NAPROXEN, b: NAPROXEN } };
    expect(resolveMed(two.meds, undefined, 'Naproxen')).toMatchObject({
      error: expect.stringContaining('Multiple'),
    });
  });
});

describe('interpretInboxItem — metric', () => {
  it('writes scoped field paths (never clobbers the whole day)', () => {
    const out = interpretInboxItem(
      'm1',
      item('metric', { dateKey: '2026-08-06', pain: 4, notes: 'tired' }),
      CTX,
    );
    if (!out.ok) throw new Error('expected ok');
    expect(out.updates).toEqual({
      'metrics/2026-08-06/by': 'applier',
      'metrics/2026-08-06/pain': 4,
      'metrics/2026-08-06/notes': 'tired',
    });
  });

  it('rejects an empty metric', () => {
    expect(interpretInboxItem('m2', item('metric', {}), CTX)).toMatchObject({ ok: false });
  });
});

describe('malformed payloads never throw', () => {
  it.each([null, 42, 'text', []])('payload %p → rejection', (payload) => {
    for (const type of ['ptSession', 'doseLog', 'metric'] as const) {
      const out = interpretInboxItem('x', item(type, payload), CTX);
      expect(out.ok).toBe(false);
    }
  });
});

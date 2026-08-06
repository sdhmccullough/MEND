import { describe, expect, it } from 'vitest';
import { buildBackfillUpdates } from '../src/lib/backfill';

describe('buildBackfillUpdates', () => {
  it('builds deterministic paths with honest records', () => {
    const updates = buildBackfillUpdates(
      'medA',
      [
        { dateKey: '2026-08-05', slot: '08:00', status: 'taken' },
        { dateKey: '2026-08-05', slot: '20:00', status: 'skipped' },
      ],
      'uid1',
    );
    expect(Object.keys(updates).sort()).toEqual([
      'doses/2026-08-05/medA_0800',
      'doses/2026-08-05/medA_2000',
    ]);
    expect(updates['doses/2026-08-05/medA_0800']).toEqual({
      medId: 'medA',
      plannedAt: '08:00',
      takenAt: null, // coarse honesty: no fictional exact times
      status: 'taken',
      backfilled: true,
      by: 'uid1',
      note: '',
    });
    expect(updates['doses/2026-08-05/medA_2000'].status).toBe('skipped');
  });

  it('is idempotent: re-painting the same cells yields identical maps', () => {
    const sel = [{ dateKey: '2026-08-05', slot: '08:00', status: 'taken' as const }];
    expect(buildBackfillUpdates('m', sel, 'u')).toEqual(buildBackfillUpdates('m', sel, 'u'));
  });

  it('returns an empty map for an empty selection', () => {
    expect(buildBackfillUpdates('m', [], 'u')).toEqual({});
  });
});

// Backfill builder: turns a painted date×slot selection into ONE atomic
// multi-path update map (committed via sync.commitBackfill). Every record
// carries backfilled: true (immutable per rules) and takenAt: null —
// exact times for last month would be fiction; "taken, morning slot" is
// honest. Deterministic paths make a re-paint idempotent.

import type { DoseRecord } from './schema';
import { scheduledDoseId } from './doses';

export interface BackfillSelection {
  dateKey: string;
  slot: string; // 'HH:MM'
  status: 'taken' | 'skipped';
}

export function buildBackfillUpdates(
  medId: string,
  selections: BackfillSelection[],
  byUid: string,
): Record<string, DoseRecord> {
  const updates: Record<string, DoseRecord> = {};
  for (const sel of selections) {
    updates[`doses/${sel.dateKey}/${scheduledDoseId(medId, sel.slot)}`] = {
      medId,
      plannedAt: sel.slot,
      takenAt: null,
      status: sel.status,
      backfilled: true,
      by: byUid,
      note: '',
    };
  }
  return updates;
}

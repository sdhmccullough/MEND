// Schema migration scaffold. Mend starts at v1 with nothing to convert —
// this exists so the first real migration (e.g. injury → injuries/$id) has
// a proven seam: pure builder exported for tests, effectful runner gated on
// meta/schemaVersion so it runs exactly once per household. (If two members
// race, both compute the same output from the same input — last write wins
// harmlessly.)

import { get, ref, update } from 'firebase/database';
import { db } from '../lib/firebase';
import { patchStore } from './useStore';
import { SCHEMA_VERSION } from '../lib/schema';

/** Pure per-version conversion; exported for unit tests. */
export function buildMigrationUpdates(fromVersion: number | null): Record<string, unknown> {
  const updates: Record<string, unknown> = {};
  // v1 is the first schema — nothing to convert, just stamp the version.
  void fromVersion;
  updates['meta/schemaVersion'] = SCHEMA_VERSION;
  return updates;
}

export async function runMigrationIfNeeded(hid: string): Promise<void> {
  let version: unknown;
  try {
    version = (await get(ref(db, `households/${hid}/meta/schemaVersion`))).val();
  } catch {
    // Offline or rules not yet extended — skip; we'll retry next attach.
    return;
  }
  if (version === SCHEMA_VERSION) return;

  patchStore({ migrating: true });
  try {
    const updates = buildMigrationUpdates(typeof version === 'number' ? version : null);
    await update(ref(db, `households/${hid}`), updates);
  } finally {
    patchStore({ migrating: false });
  }
}

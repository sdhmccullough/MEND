import { describe, expect, it } from 'vitest';
import { buildMigrationUpdates } from '../src/store/migrate';
import { SCHEMA_VERSION } from '../src/lib/schema';

describe('buildMigrationUpdates', () => {
  it('stamps the current schema version for a fresh household', () => {
    expect(buildMigrationUpdates(null)).toEqual({
      'meta/schemaVersion': SCHEMA_VERSION,
    });
  });

  it('stamps the current schema version regardless of prior version', () => {
    expect(buildMigrationUpdates(0)['meta/schemaVersion']).toBe(SCHEMA_VERSION);
  });
});

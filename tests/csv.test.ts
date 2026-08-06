import { describe, expect, it } from 'vitest';
import { toCsv } from '../src/lib/csv';

describe('toCsv', () => {
  it('quotes fields containing commas, quotes, and newlines', () => {
    const csv = toCsv(
      ['a', 'b'],
      [['plain', 'has,comma'], ['has"quote', 'has\nnewline']],
    );
    expect(csv).toContain('"has,comma"');
    expect(csv).toContain('"has""quote"');
    expect(csv).toContain('"has\nnewline"');
  });

  it('starts with a UTF-8 BOM and uses CRLF endings', () => {
    const csv = toCsv(['x'], [['1']]);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv).toContain('\r\n');
  });

  it('joins header and rows in order', () => {
    const csv = toCsv(['med', 'status'], [['Naproxen', 'taken']]);
    const [header, row] = csv.replace('﻿', '').trim().split('\r\n');
    expect(header).toBe('med,status');
    expect(row).toBe('Naproxen,taken');
  });
});

import { describe, expect, it } from 'vitest';
import { computeScores } from '@/lib/scoring';
import type { ResultRow, Status } from '@/lib/types';

// Minimal ResultRow factory — only the fields computeScores reads (result, auto) matter; the rest
// are filled with inert defaults so the shape stays valid.
function row(result: Status, auto = true): ResultRow {
  return {
    id: 'x',
    result,
    results_list: [],
    comment: '',
    details: [],
    time: 0,
    criterion: {},
    auto,
    forcedNt: false,
  };
}

describe('computeScores', () => {
  it('returns zeroed counts and null conformance for no rows', () => {
    const s = computeScores([]);
    expect(s.counts).toEqual({ c: 0, nc: 0, i: 0, na: 0, nt: 0 });
    expect(s.total).toBe(0);
    expect(s.automated).toBe(0);
    expect(s.conformance).toBeNull();
  });

  it('counts each status and totals every row', () => {
    const s = computeScores([row('c'), row('c'), row('nc'), row('i'), row('na'), row('nt')]);
    expect(s.counts).toEqual({ c: 2, nc: 1, i: 1, na: 1, nt: 1 });
    expect(s.total).toBe(6);
  });

  it('conformance = c / (c + nc) over decided criteria (ignores i/na/nt)', () => {
    // 3 conformant, 1 non-conformant, plus undecided rows that must not shift the ratio.
    const s = computeScores([
      row('c'),
      row('c'),
      row('c'),
      row('nc'),
      row('i'),
      row('na'),
      row('nt'),
    ]);
    expect(s.conformance).toBeCloseTo(3 / 4, 10);
  });

  it('conformance is null when nothing is decided (only i/na/nt)', () => {
    const s = computeScores([row('i'), row('na'), row('nt')]);
    expect(s.conformance).toBeNull();
  });

  it('conformance is 1 when every decided criterion is conformant', () => {
    const s = computeScores([row('c'), row('c'), row('na')]);
    expect(s.conformance).toBe(1);
  });

  it('conformance is 0 when every decided criterion is non-conformant', () => {
    const s = computeScores([row('nc'), row('nc'), row('i')]);
    expect(s.conformance).toBe(0);
  });

  it('automated counts only rows flagged auto, independent of total', () => {
    const s = computeScores([row('c', true), row('nc', true), row('nt', false), row('na', false)]);
    expect(s.automated).toBe(2);
    expect(s.total).toBe(4);
  });
});

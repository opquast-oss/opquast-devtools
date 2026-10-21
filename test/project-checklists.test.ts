import { describe, expect, it } from 'vitest';
import { projectChecklists } from '@/engine/launch-tests';
import type { ChecklistFile } from '@/lib/engine-assets';
import type { EngineRow } from '@/lib/types';

// Synthetic checklists with ids that are NOT in the real events/resources rulesets, so forced-nt
// never kicks in and engine verdicts are kept verbatim — keeps the projection assertions exact.
const clA: ChecklistFile = {
  '1': { name: '1', description: 'a1' },
  '2': { name: '2', description: 'a2' },
  '9': { name: '9', description: 'manual' },
};
const clB: ChecklistFile = {
  '2': { name: '2', description: 'b2' },
  '3': { name: '3', description: 'b3' },
};

const engineRows: EngineRow[] = [
  { id: '1', result: 'c' },
  { id: '2', result: 'nc' },
  { id: '3', result: 'c' },
];

describe('projectChecklists', () => {
  it('projects one engine run onto each checklist independently', () => {
    const projections = projectChecklists(engineRows, [
      ['A', clA],
      ['B', clB],
    ]);

    expect(projections.map((p) => p.slug)).toEqual(['A', 'B']);

    const a = projections[0]!;
    expect(a.rows.map((r) => r.id)).toEqual(['1', '2', '9']);
    expect(a.rows.find((r) => r.id === '1')!.result).toBe('c');
    expect(a.rows.find((r) => r.id === '2')!.result).toBe('nc');
    // criterion with no engine row → manual, not tested
    const manual = a.rows.find((r) => r.id === '9')!;
    expect(manual.result).toBe('nt');
    expect(manual.auto).toBe(false);

    const b = projections[1]!;
    expect(b.rows.map((r) => r.id)).toEqual(['2', '3']);
    expect(b.rows.find((r) => r.id === '2')!.result).toBe('nc');
    expect(b.rows.find((r) => r.id === '3')!.result).toBe('c');
  });

  it('scores each checklist over its own criteria', () => {
    const [a, b] = projectChecklists(engineRows, [
      ['A', clA],
      ['B', clB],
    ]);

    // A: decided = 1c + 1nc → conformance 0.5
    expect(a!.scores.conformance).toBeCloseTo(0.5, 10);
    expect(a!.scores.counts.c).toBe(1);
    expect(a!.scores.counts.nc).toBe(1);
    expect(a!.scores.counts.nt).toBe(1);
    expect(a!.scores.total).toBe(3);

    // B: decided = 1c + 1nc → conformance 0.5, but only 2 criteria
    expect(b!.scores.conformance).toBeCloseTo(0.5, 10);
    expect(b!.scores.total).toBe(2);
  });

  it('returns an empty projection list for no checklists', () => {
    expect(projectChecklists(engineRows, [])).toEqual([]);
  });

  it('yields an all-not-tested projection when the engine produced no rows', () => {
    // Mirrors a blocked engine injection: no engine rows → every criterion is nt/manual.
    const [a] = projectChecklists([], [['A', clA]]);
    expect(a!.rows.every((r) => r.result === 'nt')).toBe(true);
    expect(a!.scores.conformance).toBeNull();
  });
});

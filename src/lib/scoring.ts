// Single source of truth for conformance scoring. Pure function over result rows — shared by the
// engine layer (post-analysis), the storage layer (recalc after overrides) and the panel (in-memory).

import type { ResultRow, Scores, Status } from '@/lib/types';

/**
 * Count statuses and compute conformance = c / (c + nc) over every decided row: automated
 * verdicts and the ones the user set by hand alike.
 */
export function computeScores(rows: ResultRow[]): Scores {
  const counts: Record<Status, number> = { c: 0, nc: 0, i: 0, na: 0, nt: 0 };
  let automated = 0;
  for (const r of rows) {
    // A status from a record this version does not know (corrupt, or written by a later one)
    // counts in the total only: as a key it would add NaN to the counts.
    if (Object.hasOwn(counts, r.result)) counts[r.result]++;
    if (r.auto) automated++;
  }
  const decided = counts.c + counts.nc;
  return {
    counts,
    automated,
    total: rows.length,
    conformance: decided > 0 ? counts.c / decided : null,
  };
}

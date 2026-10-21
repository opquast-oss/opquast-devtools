// Joins raw engine output to checklist metadata and produces one row per checklist criterion —
// the MV3 port of opquast-desktop's `launchTests` (lib/app/tester.js). Two responsibilities:
//   1. Fill 'nt' for every checklist criterion the engine did not return (manual criteria with
//      no automated ruleset, e.g. ~44 of 75 in 742-website).
//   2. Force 'nt' for criteria whose ruleset depends on an input that is not yet reconstructed
//      (events / HTTP resources) — so a stubbed run never shows a misleading pass/fail.
//      Each recovery phase flips the matching flag in RecoveredInputs to true.

import { eventsRulesets, resourcesRulesets } from '@/engine/rule-deps.generated';
import { computeScores } from '@/lib/scoring';
import type { ChecklistFile } from '@/lib/engine-assets';
import type { EngineRow, RecoveredInputs, ResultRow, Scores } from '@/lib/types';

// Re-exported so the engine "results" layer stays the single import surface for callers.
export { computeScores };

const NO_RECOVERY: RecoveredInputs = { events: false, resources: false };

/** Build the set of ruleset ids whose result is still unreliable given what's been recovered. */
function forcedNtSet(recovered: RecoveredInputs): Set<string> {
  const s = new Set<string>();
  if (!recovered.events) for (const id of eventsRulesets) s.add(id);
  if (!recovered.resources) for (const id of resourcesRulesets) s.add(id);
  return s;
}

export function buildResults(
  engineRows: EngineRow[],
  checklist: ChecklistFile,
  recovered: RecoveredInputs = NO_RECOVERY,
): ResultRow[] {
  const byId = new Map<string, EngineRow>();
  for (const r of engineRows) byId.set(String(r.id), r);
  const forceNt = forcedNtSet(recovered);

  return Object.keys(checklist).map((id) => {
    const criterion = checklist[id]!;
    const er = byId.get(id);

    if (!er) {
      // Manual criterion: no automated ruleset evaluated it.
      return {
        id,
        result: 'nt',
        results_list: [],
        comment: '',
        details: [],
        time: 0,
        criterion,
        auto: false,
        forcedNt: false,
      };
    }

    const forced = forceNt.has(id);
    return {
      id,
      result: forced ? 'nt' : er.result,
      results_list: er.results_list ?? [],
      comment: er.comment ?? '',
      details: er.details ?? [],
      time: er.time ?? 0,
      criterion,
      auto: true,
      forcedNt: forced,
    };
  });
}

export interface ChecklistProjection {
  slug: string;
  rows: ResultRow[];
  scores: Scores;
}

/**
 * Project a single engine run onto several checklists at once: for each checklist, join the shared
 * engine rows to its criteria and score the result. Pure — used by the background multi-checklist
 * analysis so one page capture yields per-checklist rows + scores.
 */
export function projectChecklists(
  engineRows: EngineRow[],
  checklists: Iterable<readonly [string, ChecklistFile]>,
  recovered: RecoveredInputs = NO_RECOVERY,
): ChecklistProjection[] {
  const out: ChecklistProjection[] = [];
  for (const [slug, checklist] of checklists) {
    const rows = buildResults(engineRows, checklist, recovered);
    out.push({ slug, rows, scores: computeScores(rows) });
  }
  return out;
}

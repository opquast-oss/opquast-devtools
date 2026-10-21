// Result store: business logic for storing analyses and merging user overrides.
// getCombinedResults() / mergeWithOverrides() merge automatic results with manual changes.

import type { ResultRow, Scores, Status } from '@/lib/types';
import { computeScores } from '@/lib/scoring';
import {
  currentVersions,
  sameEngine,
  UNKNOWN_VERSIONS,
  type Revision,
  type VersionStamp,
} from './versions';
import {
  type StoredAnalysis,
  type UserOverride,
  type Feedback,
  type FeedbackKind,
  saveAnalysis as dbSaveAnalysis,
  getAnalysis as dbGetAnalysis,
  getAnalysesByUrl,
  getAllAnalyses as dbGetAllAnalyses,
  setUserOverride as dbSetUserOverride,
  getOverridesByUrl,
  deleteUserOverride as dbDeleteUserOverride,
  addFeedback as dbAddFeedback,
  getFeedback as dbGetFeedback,
  getAllFeedbacks as dbGetAllFeedbacks,
  makeAnalysisId,
  makeOverrideId,
  makeFeedbackId,
} from '@/lib/storage';

export type { Feedback, FeedbackKind } from '@/lib/storage';
export {
  deleteFeedback as removeFeedback,
  clearFeedbacks as clearAllFeedbacks,
  countAnalyses,
  clearAnalyses,
} from '@/lib/storage';

// ---- Types ----

export interface AnalysisSummary {
  id: string;
  url: string;
  slug: string;
  lang: string;
  timestamp: number;
  scores: Scores;
  hasOverrides: boolean;
  /** Carried so a result restored from history keeps the engine that produced it. */
  versions: VersionStamp;
  /** Criteria re-run under a different engine than the rest of the analysis. Usually absent. */
  revisions?: Revision[];
}

export interface CombinedResultRow extends ResultRow {
  /** true if this result was modified by the user (different from the automatic result) */
  userModified: boolean;
  /** Original automatic result before user override, if modified */
  originalResult?: Status;
  /** Original comment before user override, if modified */
  originalComment?: string;
}

// ---- Save & Load Analyses ----

export async function storeAnalysis(
  url: string,
  slug: string,
  lang: string,
  rows: ResultRow[],
  scores: Scores,
  meta?: StoredAnalysis['meta'],
): Promise<string> {
  const timestamp = Date.now();
  const id = makeAnalysisId(url, slug, timestamp);

  const analysis: StoredAnalysis = {
    id,
    url,
    slug,
    lang,
    timestamp,
    rows,
    scores,
    meta,
    // Stamped here rather than passed in: this is the only place an analysis is written, so
    // doing it here makes an unstamped analysis structurally impossible.
    versions: currentVersions(),
  };

  await dbSaveAnalysis(analysis);
  return id;
}

function summarize(a: StoredAnalysis, hasOverrides: boolean): AnalysisSummary {
  return {
    id: a.id,
    url: a.url,
    slug: a.slug,
    lang: a.lang,
    timestamp: a.timestamp,
    scores: a.scores as Scores,
    hasOverrides,
    versions: a.versions ?? UNKNOWN_VERSIONS,
    revisions: a.revisions,
  };
}

const newestFirst = (a: AnalysisSummary, b: AnalysisSummary) => b.timestamp - a.timestamp;

/** Every stored analysis, or only those of `url`, most recent first. */
export async function listAnalyses(url?: string): Promise<AnalysisSummary[]> {
  const analyses = url ? await getAnalysesByUrl(url) : await dbGetAllAnalyses();
  const overridden = new Map<string, boolean>();
  const summaries: AnalysisSummary[] = [];
  for (const a of analyses) {
    if (!overridden.has(a.url)) overridden.set(a.url, (await getOverridesByUrl(a.url)).length > 0);
    summaries.push(summarize(a, overridden.get(a.url)!));
  }
  return summaries.sort(newestFirst);
}

// ---- User Overrides ----

export async function setOverride(
  url: string,
  criterionId: string,
  changes: { result?: Status; comment?: string },
): Promise<void> {
  const id = makeOverrideId(url, criterionId);
  const existing = await getOverridesByUrl(url).then((list) =>
    list.find((o) => o.criterionId === criterionId),
  );

  const override: UserOverride = {
    id,
    url,
    criterionId,
    result: changes.result ?? existing?.result,
    comment: changes.comment ?? existing?.comment,
    updatedAt: Date.now(),
  };

  await dbSetUserOverride(override);
}

export async function clearOverride(url: string, criterionId: string): Promise<void> {
  const id = makeOverrideId(url, criterionId);
  await dbDeleteUserOverride(id);
}

// ---- Feedback (traceability journal, independent of overrides) ----

export interface FeedbackInput {
  url: string;
  criterionId: string;
  criterionRef: string;
  description: string;
  slug: string;
  obtainedResult: string;
  kind: FeedbackKind;
  comment: string;
  /**
   * The analysis being commented on, and the engine that produced it.
   *
   * Required, so tsc forces the caller to supply them. And they come from the DISPLAYED analysis,
   * not from `currentVersions()`: a result restored from history may have been produced by an
   * earlier build, which is precisely the case this traceability exists for.
   */
  analysisId: string;
  analysisTimestamp: number;
  versions: VersionStamp;
}

export async function recordFeedback(input: FeedbackInput): Promise<Feedback> {
  const createdAt = Date.now();
  const feedback: Feedback = {
    id: makeFeedbackId(input.url, input.criterionId, createdAt),
    createdAt,
    ...input,
  };
  await dbAddFeedback(feedback);
  return feedback;
}

export async function listFeedbacks(): Promise<Feedback[]> {
  const feedbacks = await dbGetAllFeedbacks();
  // Most recent first
  feedbacks.sort((a, b) => b.createdAt - a.createdAt);
  return feedbacks;
}

/** Edit an existing journal feedback in place (comment and/or kind), preserving id + createdAt. */
export async function updateFeedback(
  id: string,
  changes: { comment?: string; kind?: FeedbackKind },
): Promise<Feedback | null> {
  const fb = await dbGetFeedback(id);
  if (!fb) return null;
  // A field left out (undefined) keeps its value: the panel edits the comment alone.
  const updated: Feedback = {
    ...fb,
    comment: changes.comment ?? fb.comment,
    kind: changes.kind ?? fb.kind,
  };
  await dbAddFeedback(updated); // put() overwrites by id
  return updated;
}

// ---- Combined Results (merge automatic + user overrides) ----

/**
 * Merges automatic results with the user overrides recorded for `url`:
 * - a modified result or comment replaces the automatic one, and the row is flagged `userModified`;
 * - the automatic values are kept in `originalResult` / `originalComment`;
 * - an override equal to the automatic value changes nothing.
 */
export async function mergeWithOverrides(
  url: string,
  rows: ResultRow[],
): Promise<CombinedResultRow[]> {
  const overrides = new Map((await getOverridesByUrl(url)).map((o) => [o.criterionId, o]));

  return rows.map((row): CombinedResultRow => {
    const override = overrides.get(row.id);
    const resultChanged = override?.result !== undefined && override.result !== row.result;
    const commentChanged = override?.comment !== undefined && override.comment !== row.comment;
    if (!resultChanged && !commentChanged) return { ...row, userModified: false };
    return {
      ...row,
      result: resultChanged ? (override!.result as Status) : row.result,
      comment: commentChanged ? override!.comment! : row.comment,
      userModified: true,
      originalResult: resultChanged ? row.result : undefined,
      originalComment: commentChanged ? row.comment : undefined,
    };
  });
}

/** A stored analysis merged with its page's overrides, or null if the id is unknown. */
export async function getCombinedResults(analysisId: string): Promise<CombinedResultRow[] | null> {
  const analysis = await dbGetAnalysis(analysisId);
  return analysis ? mergeWithOverrides(analysis.url, analysis.rows as ResultRow[]) : null;
}

/**
 * Replaces one criterion's row in a stored analysis with a freshly re-tested row,
 * recomputes and persists the stored scores. Returns the new scores (or null if not found).
 * Used by the per-criterion "re-run" action.
 */
export async function updateAnalysisCriterion(
  analysisId: string,
  freshRow: ResultRow,
): Promise<Scores | null> {
  const analysis = await dbGetAnalysis(analysisId);
  if (!analysis) return null;
  const rows = analysis.rows as ResultRow[];
  const idx = rows.findIndex((r) => r.id === freshRow.id);
  if (idx === -1) return null;
  rows[idx] = freshRow;

  // This row was produced now, the rest of the analysis earlier. Usually by the same engine, in
  // which case there is nothing to say — but if the extension was updated in between, the analysis
  // silently holds rows from two engines. Record only the difference: zero cost in the normal case.
  const now = currentVersions();
  if (!sameEngine(now, analysis.versions)) {
    analysis.revisions = [
      ...(analysis.revisions ?? []).filter((r) => r.criterionId !== freshRow.id),
      { criterionId: freshRow.id, at: Date.now(), versions: now },
    ];
  }

  const scores = computeScores(rows);
  analysis.scores = scores;
  await dbSaveAnalysis(analysis);
  return scores;
}

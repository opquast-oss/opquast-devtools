// Typed wire protocol for the DevTools panel ⇄ background port (`browser.runtime.connect`,
// name 'oqs-panel'). Two discriminated unions — one per direction — so each `onMessage` listener
// narrows its payload by `type`. Purely type-level: erased at build, zero runtime effect.

import type { ResultRow, Scores, Status } from '@/lib/types';
import type { VersionStamp } from '@/lib/versions';
import type {
  AnalysisSummary,
  CombinedResultRow,
  Feedback,
  FeedbackInput,
  FeedbackKind,
} from '@/lib/result-store';

// ---- Panel → background ----------------------------------------------------

export interface PingRequest {
  type: 'PING';
  tabId: number;
}
export interface AnalyzeRequestMsg {
  type: 'ANALYZE';
  tabId: number;
  /** The active checklist that drives the Results table (RESULT returns its rows/scores). */
  slug: string;
  /** All enabled checklists to analyze in one pass (defaults to [slug]); each is stored so the
   *  scores breakdown covers every ticked referential. */
  slugs?: string[];
  lang: string;
  options?: Record<string, unknown>;
  /** The inspected page's URL as the panel sees it: Firefox hides tab.url from the background
   *  when the host permission is missing, and the access diagnosis needs it. */
  url?: string;
}
export interface GetHistoryRequest {
  type: 'GET_HISTORY';
  url?: string;
}
export interface LoadAnalysisRequest {
  type: 'LOAD_ANALYSIS';
  analysisId: string;
}
export interface SetOverrideRequest {
  type: 'SET_OVERRIDE';
  url: string;
  criterionId: string;
  result?: Status;
  comment?: string;
}
export interface ClearOverrideRequest {
  type: 'CLEAR_OVERRIDE';
  url: string;
  criterionId: string;
}
export interface ReanalyzeCriterionRequest {
  type: 'REANALYZE_CRITERION';
  tabId: number;
  slug: string;
  lang: string;
  criterionId: string;
  analysisId: string;
  /** See AnalyzeRequestMsg.url. */
  url?: string;
}
export interface AddFeedbackRequest {
  type: 'ADD_FEEDBACK';
  replaceId?: string;
  feedback: FeedbackInput;
}
export interface GetFeedbacksRequest {
  type: 'GET_FEEDBACKS';
}
export interface UpdateFeedbackRequest {
  type: 'UPDATE_FEEDBACK';
  id: string;
  comment?: string;
  kind?: FeedbackKind;
}
export interface DeleteFeedbackRequest {
  type: 'DELETE_FEEDBACK';
  id: string;
}
export interface ClearFeedbacksRequest {
  type: 'CLEAR_FEEDBACKS';
}
export interface OpenOptionsRequest {
  type: 'OPEN_OPTIONS';
}

/**
 * Page-scoped requests carry the panel's current `requestId`; the background echoes it on the
 * reply (and on an ERROR), so the panel can drop answers about a page or a run it has left.
 */
export interface Tracked {
  requestId?: number;
}

export type PanelRequest = Tracked &
  (
    | PingRequest
    | AnalyzeRequestMsg
    | GetHistoryRequest
    | LoadAnalysisRequest
    | SetOverrideRequest
    | ClearOverrideRequest
    | ReanalyzeCriterionRequest
    | AddFeedbackRequest
    | GetFeedbacksRequest
    | UpdateFeedbackRequest
    | DeleteFeedbackRequest
    | ClearFeedbacksRequest
    | OpenOptionsRequest
  );

// ---- Background → panel ----------------------------------------------------

export interface PongResponse {
  type: 'PONG';
  tabId: number;
}
export interface ResultResponse {
  type: 'RESULT';
  rows: CombinedResultRow[];
  scores: Scores;
  url: string;
  analysisId: string;
  /** false when the engine could not run in the page (e.g. a strict CSP): the rows are all 'nt'. */
  engineInjected: boolean;
  versions: VersionStamp;
}
export interface HistoryResponse {
  type: 'HISTORY';
  analyses: AnalysisSummary[];
}
export interface AnalysisLoadedResponse {
  type: 'ANALYSIS_LOADED';
  rows: CombinedResultRow[];
  scores: Scores;
}
export interface OverrideSetResponse {
  type: 'OVERRIDE_SET';
}
export interface OverrideClearedResponse {
  type: 'OVERRIDE_CLEARED';
}
export interface CriterionReanalyzedResponse {
  type: 'CRITERION_REANALYZED';
  criterionId: string;
  row: (ResultRow & { userModified: boolean }) | null;
  scores: Scores | null;
}
export interface FeedbackSavedResponse {
  type: 'FEEDBACK_SAVED';
  feedback: Feedback;
}
export interface FeedbacksResponse {
  type: 'FEEDBACKS';
  feedbacks: Feedback[];
}
export interface FeedbackDeletedResponse {
  type: 'FEEDBACK_DELETED';
  id: string;
}
export interface FeedbacksClearedResponse {
  type: 'FEEDBACKS_CLEARED';
}
export interface ErrorResponse {
  type: 'ERROR';
  /** An AccessFailure code when the page could not be reached, else the error message + stack. */
  error: string;
  /** For an AccessFailure: the browser's own message, kept for diagnosis. */
  detail?: string;
  /** The request that failed: only a failed ANALYZE replaces the results on screen. */
  request?: string;
}

export type BgResponse = Tracked &
  (
    | PongResponse
    | ResultResponse
    | HistoryResponse
    | AnalysisLoadedResponse
    | OverrideSetResponse
    | OverrideClearedResponse
    | CriterionReanalyzedResponse
    | FeedbackSavedResponse
    | FeedbacksResponse
    | FeedbackDeletedResponse
    | FeedbacksClearedResponse
    | ErrorResponse
  );

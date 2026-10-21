// IndexedDB wrapper for Opquast DevTools persistence.
// Stores analyses, user overrides (manual result/comment changes) and reviewer feedbacks.

import { UNKNOWN_VERSIONS, type Revision, type VersionStamp } from './versions';

const DB_NAME = 'opquast-devtools';
const DB_VERSION = 3;

export interface StoredAnalysis {
  id: string; // `${url}|${slug}|${timestamp}`
  url: string;
  slug: string;
  lang: string;
  timestamp: number;
  rows: unknown[]; // ResultRow[] - stored as unknown to avoid circular import
  scores: unknown; // Scores
  /** Number of page resources the engine was given. */
  meta?: { resourceCount: number };
  /** Which engine produced these rows. Always present from v3 on; empty strings if backfilled. */
  versions: VersionStamp;
  /**
   * Criteria re-run later under a different engine.
   *
   * `updateAnalysisCriterion` rewrites a row in place, so an analysis can hold rows produced at
   * two moments. Only recorded when the stamp actually differs — zero cost in the normal case.
   */
  revisions?: Revision[];
}

export interface UserOverride {
  id: string; // `${url}|${criterionId}`
  url: string;
  criterionId: string;
  result?: string; // Status
  comment?: string;
  updatedAt: number;
}

/** Reviewer feedback: a standalone traceability journal, independent of overrides/scores. */
export type FeedbackKind = 'confirm' | 'refute' | 'clarify' | 'change' | 'note';

export interface Feedback {
  id: string; // `${url}|${criterionId}|${createdAt}`
  url: string;
  criterionId: string;
  criterionRef: string; // criterion number, e.g. "122"
  description: string;
  slug: string; // checklist slug at feedback time
  obtainedResult: string; // Status shown when the feedback was recorded
  kind: FeedbackKind;
  comment: string;
  createdAt: number;
  /** The analysis whose verdict this comments on. '' when unknown (written before v3). */
  analysisId: string;
  /**
   * That analysis's timestamp, 0 when unknown. Kept separate from the id even though the id
   * encodes it: the id is a composite key containing the URL, and parsing it would break on any
   * URL containing a pipe.
   */
  analysisTimestamp: number;
  /** The engine that produced the verdict, denormalised: a feedback leaves this machine. */
  versions: VersionStamp;
}

/**
 * Stamp records written before traceability existed.
 *
 * Four constraints, each of which turns a working migration into a broken one if missed:
 *
 *  - use the upgrade's own transaction (`request.transaction`), never `db.transaction()` — opening
 *    one during a versionchange throws;
 *  - no `await` anywhere on this path. A versionchange transaction auto-commits as soon as the
 *    microtask queue drains with no request pending, so one await yields TransactionInactiveError.
 *    Hence the recursive cursor rather than a loop;
 *  - `cursor.update()` rather than `store.put()`: the idiomatic in-place rewrite, and no chance of
 *    colliding with the keyPath;
 *  - the caller checks `oldVersion > 0` — a fresh install has nothing to backfill.
 *
 * Records get UNKNOWN_VERSIONS, never a guessed value. And no attempt is made to infer a
 * feedback's missing analysisId from url + createdAt: a wrong link is worse than an honest blank.
 */
function backfillVersions(tx: IDBTransaction): void {
  for (const name of ['analyses', 'feedbacks'] as const) {
    const cursorReq = tx.objectStore(name).openCursor();
    cursorReq.onsuccess = () => {
      const cursor = cursorReq.result;
      if (!cursor) return;
      const rec = cursor.value as Record<string, unknown>;
      if (!rec.versions) {
        rec.versions = { ...UNKNOWN_VERSIONS };
        if (name === 'feedbacks') {
          rec.analysisId ??= '';
          rec.analysisTimestamp ??= 0;
        }
        cursor.update(rec);
      }
      cursor.continue();
    };
  }
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;

  const p = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      // Store for complete analyses
      if (!db.objectStoreNames.contains('analyses')) {
        const analysesStore = db.createObjectStore('analyses', { keyPath: 'id' });
        analysesStore.createIndex('url', 'url', { unique: false });
        analysesStore.createIndex('slug', 'slug', { unique: false });
        analysesStore.createIndex('timestamp', 'timestamp', { unique: false });
      }

      // Store for user overrides (manual changes)
      if (!db.objectStoreNames.contains('userOverrides')) {
        const overridesStore = db.createObjectStore('userOverrides', { keyPath: 'id' });
        overridesStore.createIndex('url', 'url', { unique: false });
        overridesStore.createIndex('criterionId', 'criterionId', { unique: false });
      }

      // Store for reviewer feedback (confirm / refute / clarify / change), added in v2.
      if (!db.objectStoreNames.contains('feedbacks')) {
        const feedbacksStore = db.createObjectStore('feedbacks', { keyPath: 'id' });
        feedbacksStore.createIndex('url', 'url', { unique: false });
        feedbacksStore.createIndex('createdAt', 'createdAt', { unique: false });
      }

      // v3: engine traceability. The first migration here to touch DATA rather than schema — the
      // three blocks above are idempotent and also serve a fresh install; this one must not run
      // on one.
      if (event.oldVersion > 0 && event.oldVersion < 3) {
        backfillVersions((event.target as IDBOpenDBRequest).transaction!);
      }
    };
  });

  // Cache the pending/successful open, but never a rejection: a one-time failure (e.g. private-mode
  // quota) would otherwise stay sticky for the whole session. Clear the cache on reject so the next
  // call retries. Callers still receive the real rejection from `p`.
  dbPromise = p;
  p.catch(() => {
    if (dbPromise === p) dbPromise = null;
  });
  return p;
}

type StoreName = 'analyses' | 'userOverrides' | 'feedbacks';

/** Run one request against one object store, in its own transaction. */
async function request<T>(
  store: StoreName,
  mode: IDBTransactionMode,
  make: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const req = make(db.transaction(store, mode).objectStore(store));
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
  });
}

// ---- Analyses ----

export async function saveAnalysis(analysis: StoredAnalysis): Promise<void> {
  await request('analyses', 'readwrite', (s) => s.put(analysis));
}

export function getAnalysis(id: string): Promise<StoredAnalysis | undefined> {
  return request('analyses', 'readonly', (s) => s.get(id));
}

export function getAnalysesByUrl(url: string): Promise<StoredAnalysis[]> {
  return request('analyses', 'readonly', (s) => s.index('url').getAll(url));
}

export function getAllAnalyses(): Promise<StoredAnalysis[]> {
  return request('analyses', 'readonly', (s) => s.getAll());
}

export function countAnalyses(): Promise<number> {
  return request('analyses', 'readonly', (s) => s.count());
}

/** Drop the whole analysis history. Overrides and feedbacks have their own deletion paths. */
export async function clearAnalyses(): Promise<void> {
  await request('analyses', 'readwrite', (s) => s.clear());
}

// ---- User overrides ----

export async function setUserOverride(override: UserOverride): Promise<void> {
  await request('userOverrides', 'readwrite', (s) => s.put(override));
}

export function getOverridesByUrl(url: string): Promise<UserOverride[]> {
  return request('userOverrides', 'readonly', (s) => s.index('url').getAll(url));
}

export async function deleteUserOverride(id: string): Promise<void> {
  await request('userOverrides', 'readwrite', (s) => s.delete(id));
}

// ---- Feedbacks ----

export async function addFeedback(feedback: Feedback): Promise<void> {
  await request('feedbacks', 'readwrite', (s) => s.put(feedback));
}

export function getFeedback(id: string): Promise<Feedback | undefined> {
  return request('feedbacks', 'readonly', (s) => s.get(id));
}

export function getAllFeedbacks(): Promise<Feedback[]> {
  return request('feedbacks', 'readonly', (s) => s.getAll());
}

export async function deleteFeedback(id: string): Promise<void> {
  await request('feedbacks', 'readwrite', (s) => s.delete(id));
}

export async function clearFeedbacks(): Promise<void> {
  await request('feedbacks', 'readwrite', (s) => s.clear());
}

// ---- Utility ----

export function makeAnalysisId(url: string, slug: string, timestamp: number): string {
  return `${url}|${slug}|${timestamp}`;
}

export function makeOverrideId(url: string, criterionId: string): string {
  return `${url}|${criterionId}`;
}

export function makeFeedbackId(url: string, criterionId: string, createdAt: number): string {
  return `${url}|${criterionId}|${createdAt}`;
}

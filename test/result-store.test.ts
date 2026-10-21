import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it, vi } from 'vitest';
import { computeScores } from '@/lib/scoring';
import type { ResultRow, Status } from '@/lib/types';

// Each test gets a brand-new in-memory IndexedDB and a fresh module graph, so storage.ts's cached
// connection is re-created and tests never leak state into one another.
async function freshStore() {
  globalThis.indexedDB = new IDBFactory();
  vi.resetModules();
  return import('@/lib/result-store');
}

function row(id: string, result: Status, comment = '', auto = true): ResultRow {
  return {
    id,
    result,
    results_list: [],
    comment,
    details: [],
    time: 0,
    criterion: {},
    auto,
    forcedNt: false,
  };
}

const URL = 'https://example.test/';

describe('getCombinedResults', () => {
  it('marks nothing as user-modified when there are no overrides', async () => {
    const store = await freshStore();
    const rows = [row('1', 'c'), row('2', 'nc')];
    const id = await store.storeAnalysis(URL, 's', 'fr', rows, computeScores(rows));

    const combined = await store.getCombinedResults(id);
    expect(combined).not.toBeNull();
    expect(combined!.every((r) => r.userModified === false)).toBe(true);
    expect(combined!.map((r) => r.result)).toEqual(['c', 'nc']);
  });

  it('applies a result override and preserves the original result', async () => {
    const store = await freshStore();
    const rows = [row('1', 'c'), row('2', 'nc')];
    const id = await store.storeAnalysis(URL, 's', 'fr', rows, computeScores(rows));

    await store.setOverride(URL, '1', { result: 'na' });
    const combined = await store.getCombinedResults(id);
    const r1 = combined!.find((r) => r.id === '1')!;

    expect(r1.result).toBe('na');
    expect(r1.userModified).toBe(true);
    expect(r1.originalResult).toBe('c');
    expect(r1.originalComment).toBeUndefined();
    // untouched row stays clean
    expect(combined!.find((r) => r.id === '2')!.userModified).toBe(false);
  });

  it('applies a comment override and preserves the original comment', async () => {
    const store = await freshStore();
    const rows = [row('1', 'c', 'old')];
    const id = await store.storeAnalysis(URL, 's', 'fr', rows, computeScores(rows));

    await store.setOverride(URL, '1', { comment: 'new note' });
    const r1 = (await store.getCombinedResults(id))!.find((r) => r.id === '1')!;

    expect(r1.comment).toBe('new note');
    expect(r1.userModified).toBe(true);
    expect(r1.originalComment).toBe('old');
    expect(r1.originalResult).toBeUndefined();
  });

  it('does not flag an override that equals the current value', async () => {
    const store = await freshStore();
    const rows = [row('1', 'c', 'same')];
    const id = await store.storeAnalysis(URL, 's', 'fr', rows, computeScores(rows));

    await store.setOverride(URL, '1', { result: 'c', comment: 'same' });
    const r1 = (await store.getCombinedResults(id))!.find((r) => r.id === '1')!;

    expect(r1.userModified).toBe(false);
  });

  it('returns null for an unknown analysis id', async () => {
    const store = await freshStore();
    expect(await store.getCombinedResults('nope')).toBeNull();
  });

  it('clearOverride reverts a row to its automatic value', async () => {
    const store = await freshStore();
    const rows = [row('1', 'c')];
    const id = await store.storeAnalysis(URL, 's', 'fr', rows, computeScores(rows));

    await store.setOverride(URL, '1', { result: 'nc' });
    await store.clearOverride(URL, '1');
    const r1 = (await store.getCombinedResults(id))!.find((r) => r.id === '1')!;

    expect(r1.result).toBe('c');
    expect(r1.userModified).toBe(false);
  });
});

describe('mergeWithOverrides (in-memory rows)', () => {
  it('overlays overrides onto fresh rows without a stored analysis', async () => {
    const store = await freshStore();
    await store.setOverride(URL, '1', { result: 'na' });

    const merged = await store.mergeWithOverrides(URL, [row('1', 'c'), row('2', 'nc')]);
    expect(merged.find((r) => r.id === '1')!.result).toBe('na');
    expect(merged.find((r) => r.id === '1')!.userModified).toBe(true);
    expect(merged.find((r) => r.id === '2')!.userModified).toBe(false);
  });
});

describe('listAnalyses', () => {
  it('lists most recent first, for one page or all, and flags pages with overrides', async () => {
    const store = await freshStore();
    const rows = [row('1', 'c')];
    const now = vi.spyOn(Date, 'now');
    now.mockReturnValue(100);
    const older = await store.storeAnalysis(URL, 's', 'fr', rows, computeScores(rows));
    now.mockReturnValue(200);
    const newer = await store.storeAnalysis(URL, 't', 'fr', rows, computeScores(rows));
    now.mockReturnValue(300);
    const other = await store.storeAnalysis(
      'https://other.test/',
      's',
      'fr',
      rows,
      computeScores(rows),
    );
    now.mockRestore();
    await store.setOverride(URL, '1', { result: 'nc' });

    const forUrl = await store.listAnalyses(URL);
    expect(forUrl.map((a) => a.id)).toEqual([newer, older]);
    expect(forUrl.every((a) => a.hasOverrides)).toBe(true);

    const all = await store.listAnalyses();
    expect(all.map((a) => a.id)).toEqual([other, newer, older]);
    expect(all[0]!.hasOverrides).toBe(false);
  });
});

describe('updateAnalysisCriterion', () => {
  it('replaces one row and recomputes the stored scores', async () => {
    const store = await freshStore();
    const rows = [row('1', 'nc'), row('2', 'nc')];
    const id = await store.storeAnalysis(URL, 's', 'fr', rows, computeScores(rows));

    const scores = await store.updateAnalysisCriterion(id, row('1', 'c'));
    expect(scores).not.toBeNull();
    expect(scores!.counts.c).toBe(1);
    expect(scores!.counts.nc).toBe(1);
    // persisted: reloading reflects the new row
    const combined = await store.getCombinedResults(id);
    expect(combined!.find((r) => r.id === '1')!.result).toBe('c');
  });

  it('records a revision only when another engine re-tests a criterion, once per criterion', async () => {
    const store = await freshStore();
    const storage = await import('@/lib/storage');
    const rows = [row('1', 'nc'), row('2', 'nc')];
    const id = await store.storeAnalysis(URL, 's', 'fr', rows, computeScores(rows));

    // same engine: nothing to record
    await store.updateAnalysisCriterion(id, row('1', 'c'));
    expect((await storage.getAnalysis(id))!.revisions).toBeUndefined();

    // the analysis came from an older engine
    const stored = (await storage.getAnalysis(id))!;
    await storage.saveAnalysis({ ...stored, versions: { ...stored.versions!, hash: 'older' } });
    await store.updateAnalysisCriterion(id, row('1', 'nc'));
    await store.updateAnalysisCriterion(id, row('1', 'c'));
    const revisions = (await storage.getAnalysis(id))!.revisions!;
    expect(revisions.map((r) => r.criterionId)).toEqual(['1']);
  });

  it('returns null when the criterion is not part of the analysis', async () => {
    const store = await freshStore();
    const rows = [row('1', 'c')];
    const id = await store.storeAnalysis(URL, 's', 'fr', rows, computeScores(rows));
    expect(await store.updateAnalysisCriterion(id, row('999', 'c'))).toBeNull();
  });
});

describe('feedback journal', () => {
  it('records feedbacks and lists them most-recent-first', async () => {
    const store = await freshStore();
    const base = {
      url: URL,
      criterionRef: '15',
      description: 'd',
      slug: 's',
      obtainedResult: 'c',
      comment: '',
      analysisId: 'a1',
      analysisTimestamp: 1000,
      versions: { ext: '0.6.0', engine: '2.0.0-alpha.1', overlay: '0.6.0', hash: 'abc123' },
    };
    const first = await store.recordFeedback({ ...base, criterionId: '1', kind: 'confirm' });
    const second = await store.recordFeedback({ ...base, criterionId: '2', kind: 'refute' });

    const list = await store.listFeedbacks();
    expect(list.map((f) => f.id)).toContain(first.id);
    expect(list.map((f) => f.id)).toContain(second.id);
    // sorted by createdAt descending
    for (let i = 1; i < list.length; i++) {
      expect(list[i - 1]!.createdAt).toBeGreaterThanOrEqual(list[i]!.createdAt);
    }
  });

  it('keeps the kind when only the comment is edited', async () => {
    const store = await freshStore();
    const fb = await store.recordFeedback({
      url: URL,
      criterionId: '1',
      criterionRef: '15',
      description: 'd',
      slug: 's',
      obtainedResult: 'c',
      kind: 'refute',
      comment: 'before',
      analysisId: 'a1',
      analysisTimestamp: 1000,
      versions: { ext: '0.6.0', engine: '2.0.0-alpha.1', overlay: '0.6.0', hash: 'abc123' },
    });

    const updated = await store.updateFeedback(fb.id, { comment: 'after', kind: undefined });
    expect(updated).toMatchObject({ kind: 'refute', comment: 'after' });
    expect((await store.listFeedbacks())[0]).toMatchObject({ kind: 'refute', comment: 'after' });
  });

  it('clearAllFeedbacks empties the journal', async () => {
    const store = await freshStore();
    await store.recordFeedback({
      url: URL,
      criterionId: '1',
      criterionRef: '15',
      description: 'd',
      slug: 's',
      obtainedResult: 'c',
      kind: 'confirm',
      comment: '',
      analysisId: 'a1',
      analysisTimestamp: 1000,
      versions: { ext: '0.6.0', engine: '2.0.0-alpha.1', overlay: '0.6.0', hash: 'abc123' },
    });
    await store.clearAllFeedbacks();
    expect(await store.listFeedbacks()).toEqual([]);
  });
});

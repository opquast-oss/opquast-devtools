import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it, vi } from 'vitest';
import type { StoredAnalysis } from '@/lib/storage';

async function freshStorage() {
  globalThis.indexedDB = new IDBFactory();
  vi.resetModules();
  return import('@/lib/storage');
}

function analysis(id: string, url: string, slug: string, timestamp: number): StoredAnalysis {
  return {
    id,
    url,
    slug,
    lang: 'fr',
    timestamp,
    versions: { ext: '0.6.0', engine: '2.0.0-alpha.1', overlay: '0.6.0', hash: 'abc123' },
    rows: [],
    scores: {
      counts: { c: 0, nc: 0, i: 0, na: 0, nt: 0 },
      automated: 0,
      total: 0,
      conformance: null,
    },
  };
}

const URL = 'https://example.test/';

describe('analyses CRUD', () => {
  it('saves, gets and lists by url', async () => {
    const s = await freshStorage();
    await s.saveAnalysis(analysis('a1', URL, 'x', 100));
    await s.saveAnalysis(analysis('a2', URL, 'y', 200));
    await s.saveAnalysis(analysis('a3', 'https://other.test/', 'x', 300));

    expect((await s.getAnalysis('a1'))?.slug).toBe('x');
    const byUrl = await s.getAnalysesByUrl(URL);
    expect(byUrl.map((a) => a.id).sort()).toEqual(['a1', 'a2']);
    expect(await s.getAnalysis('missing')).toBeUndefined();
    expect((await s.getAllAnalyses()).length).toBe(3);
  });

  it('counts and clears the analyses, leaving overrides alone', async () => {
    const s = await freshStorage();
    await s.saveAnalysis(analysis('a1', URL, 'x', 100));
    await s.saveAnalysis(analysis('a2', URL, 'y', 200));
    await s.setUserOverride({
      id: s.makeOverrideId(URL, '1'),
      url: URL,
      criterionId: '1',
      result: 'nc',
      updatedAt: 1,
    });
    expect(await s.countAnalyses()).toBe(2);

    await s.clearAnalyses();
    expect(await s.countAnalyses()).toBe(0);
    expect(await s.getAnalysesByUrl(URL)).toEqual([]);
    expect((await s.getOverridesByUrl(URL)).length).toBe(1);
  });
});

describe('overrides & feedback CRUD', () => {
  it('stores overrides by url and deletes them by id', async () => {
    const s = await freshStorage();
    await s.setUserOverride({
      id: s.makeOverrideId(URL, '1'),
      url: URL,
      criterionId: '1',
      result: 'nc',
      updatedAt: 1,
    });
    expect((await s.getOverridesByUrl(URL)).length).toBe(1);
    await s.deleteUserOverride(s.makeOverrideId(URL, '1'));
    expect(await s.getOverridesByUrl(URL)).toEqual([]);
  });

  it('stores, lists and clears feedbacks', async () => {
    const s = await freshStorage();
    await s.addFeedback({
      id: s.makeFeedbackId(URL, '1', 10),
      url: URL,
      criterionId: '1',
      criterionRef: '15',
      description: 'd',
      slug: 'x',
      obtainedResult: 'c',
      kind: 'confirm',
      comment: '',
      createdAt: 10,
      analysisId: '',
      analysisTimestamp: 0,
      versions: { ext: '0.6.0', engine: '2.0.0-alpha.1', overlay: '0.6.0', hash: 'abc123' },
    });
    expect((await s.getAllFeedbacks()).length).toBe(1);
    await s.clearFeedbacks();
    expect(await s.getAllFeedbacks()).toEqual([]);
  });
});

describe('IndexedDB v1 -> v2 migration', () => {
  it('adds the feedbacks store on upgrade while preserving existing analyses', async () => {
    globalThis.indexedDB = new IDBFactory();

    // Simulate a v1 database: analyses + userOverrides stores only (no feedbacks), with one record.
    await new Promise<void>((resolve, reject) => {
      const req = globalThis.indexedDB.open('opquast-devtools', 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        const a = db.createObjectStore('analyses', { keyPath: 'id' });
        a.createIndex('url', 'url', { unique: false });
        a.createIndex('slug', 'slug', { unique: false });
        a.createIndex('timestamp', 'timestamp', { unique: false });
        const o = db.createObjectStore('userOverrides', { keyPath: 'id' });
        o.createIndex('url', 'url', { unique: false });
        o.createIndex('criterionId', 'criterionId', { unique: false });
      };
      req.onsuccess = () => {
        const db = req.result;
        const tx = db.transaction('analyses', 'readwrite');
        tx.objectStore('analyses').put(analysis('legacy', URL, 'x', 42));
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => reject(tx.error);
      };
      req.onerror = () => reject(req.error);
    });

    // storage.ts opens at DB_VERSION=2 → onupgradeneeded runs the 1->2 migration.
    vi.resetModules();
    const s = await import('@/lib/storage');

    // Pre-existing analysis survived the upgrade.
    expect((await s.getAnalysis('legacy'))?.slug).toBe('x');

    // The new feedbacks store exists and is usable.
    await s.addFeedback({
      id: s.makeFeedbackId(URL, '1', 5),
      url: URL,
      criterionId: '1',
      criterionRef: '15',
      description: 'd',
      slug: 'x',
      obtainedResult: 'c',
      kind: 'confirm',
      comment: '',
      createdAt: 5,
      analysisId: '',
      analysisTimestamp: 0,
      versions: { ext: '0.6.0', engine: '2.0.0-alpha.1', overlay: '0.6.0', hash: 'abc123' },
    });
    expect((await s.getAllFeedbacks()).length).toBe(1);
  });
});

describe('IndexedDB v2 -> v3 migration', () => {
  it('stamps pre-existing analyses and feedbacks with the unknown sentinel', async () => {
    globalThis.indexedDB = new IDBFactory();

    // A v2 database: the three stores, holding records written before traceability existed —
    // so without `versions`, without `analysisId`.
    await new Promise<void>((resolve, reject) => {
      const req = globalThis.indexedDB.open('opquast-devtools', 2);
      req.onupgradeneeded = () => {
        const db = req.result;
        const a = db.createObjectStore('analyses', { keyPath: 'id' });
        a.createIndex('url', 'url', { unique: false });
        a.createIndex('slug', 'slug', { unique: false });
        a.createIndex('timestamp', 'timestamp', { unique: false });
        const o = db.createObjectStore('userOverrides', { keyPath: 'id' });
        o.createIndex('url', 'url', { unique: false });
        o.createIndex('criterionId', 'criterionId', { unique: false });
        const f = db.createObjectStore('feedbacks', { keyPath: 'id' });
        f.createIndex('url', 'url', { unique: false });
        f.createIndex('createdAt', 'createdAt', { unique: false });
      };
      req.onsuccess = () => {
        const db = req.result;
        const tx = db.transaction(['analyses', 'feedbacks'], 'readwrite');
        // Deliberately shaped as v2 records: no versions field at all.
        tx.objectStore('analyses').put({
          id: 'old-a',
          url: URL,
          slug: 'x',
          lang: 'fr',
          timestamp: 42,
          rows: [],
          scores: {},
          pageInfo: null,
        });
        tx.objectStore('feedbacks').put({
          id: 'old-f',
          url: URL,
          criterionId: '1',
          criterionRef: '15',
          description: 'd',
          slug: 'x',
          obtainedResult: 'c',
          kind: 'confirm',
          comment: '',
          createdAt: 5,
        });
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => reject(tx.error);
      };
      req.onerror = () => reject(req.error);
    });

    vi.resetModules();
    const s = await import('@/lib/storage');
    const v = await import('@/lib/versions');

    const a = await s.getAnalysis('old-a');
    expect(a?.slug).toBe('x');
    // Stamped as unknown rather than guessed: the record may have come from 0.5.2, not 0.5.6.
    expect(v.isUnknown(a!.versions)).toBe(true);
    expect(a!.versions).toEqual({ ext: '', engine: '', overlay: '', hash: '' });

    const f = (await s.getAllFeedbacks()).find((x) => x.id === 'old-f');
    expect(f?.comment).toBe('');
    expect(v.isUnknown(f!.versions)).toBe(true);
    // No link is invented from url + createdAt: a wrong link is worse than an honest blank.
    expect(f!.analysisId).toBe('');
    expect(f!.analysisTimestamp).toBe(0);
  });

  it('leaves an already-stamped record alone', async () => {
    globalThis.indexedDB = new IDBFactory();
    vi.resetModules();
    const s = await import('@/lib/storage');

    const stamped = { ext: '0.6.0', engine: '2.0.0-alpha.1', overlay: '0.6.0', hash: 'abc123' };
    await s.saveAnalysis(analysis('fresh', URL, 'x', 1));
    expect((await s.getAnalysis('fresh'))?.versions).toEqual(stamped);
  });
});

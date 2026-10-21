// @vitest-environment happy-dom
// The panel controller (main.ts) end to end within happy-dom: what it does with the background's
// answers. The port is the fake from helpers/panel; the devtools API and the manifest are stubbed.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing';
import { loadPanelContext, portLog } from './helpers/panel';
import type { CombinedResultRow, AnalysisSummary } from '@/lib/result-store';
import type { Status } from '@/lib/types';

const URL_A = 'https://example.test/a';
const BASICS = '901-opquast-basics';
const V5 = '900-opquast-v5';
const flush = () => new Promise((r) => setTimeout(r, 0));

function row(id: string, result: Status, over: Partial<CombinedResultRow> = {}): CombinedResultRow {
  return {
    id,
    result,
    results_list: [],
    comment: '',
    details: [],
    time: 0,
    criterion: { name: id, description: `criterion ${id}` },
    auto: true,
    forcedNt: false,
    userModified: false,
    ...over,
  };
}

function summary(id: string, slug: string, timestamp: number): AnalysisSummary {
  const scores = {
    counts: { c: 1, nc: 0, i: 0, na: 0, nt: 0 },
    automated: 1,
    total: 1,
    conformance: 1,
  };
  return {
    id,
    url: URL_A,
    slug,
    lang: 'fr',
    timestamp,
    scores,
    hasOverrides: false,
  } as AnalysisSummary;
}

let navigate: (url: string) => void = () => {};

/** Boot main.ts with both checklists enabled, Basics active, no auto-run. */
async function bootPanel(prefs: Record<string, unknown> = {}) {
  fakeBrowser.reset();
  await fakeBrowser.storage.local.set({
    'oqs-prefs': {
      slug: BASICS,
      enabledChecklists: [BASICS, V5],
      autoRun: false,
      ...prefs,
    },
  });
  const context = await loadPanelContext();
  const b = globalThis as unknown as { browser: Record<string, any> };
  b.browser.runtime.getManifest = () => ({ version: '0.7.0' });
  b.browser.devtools = {
    inspectedWindow: {
      tabId: 7,
      eval: (_expr: string, _opts: unknown, cb: (r: string, i: unknown) => void) =>
        cb(URL_A, undefined),
    },
    network: { onNavigated: { addListener: (cb: (url: string) => void) => (navigate = cb) } },
  };
  // Not vi.stubGlobal: unstubAllGlobals() would also remove the `browser` global WxtVitest stubs.
  vi.spyOn(globalThis, 'fetch').mockImplementation(
    async () =>
      ({
        ok: true,
        json: async () => [
          { slug: V5, names: { fr: 'V5', en: 'V5' }, langs: ['fr', 'en'] },
          { slug: BASICS, names: { fr: 'Basics', en: 'Basics' }, langs: ['fr', 'en'] },
        ],
      }) as Response,
  );
  await import('@/entrypoints/panel/main');
  await vi.waitFor(() => expect(portLog.sent.some((m) => m.type === 'GET_HISTORY')).toBe(true));
  return context;
}

const sent = (type: string) => portLog.sent.filter((m) => m.type === type);

afterEach(() => {
  vi.restoreAllMocks();
});

describe('panel controller', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('keeps the active checklist when the history lists another one first', async () => {
    const { els, state } = await bootPanel();
    portLog.deliver({
      type: 'HISTORY',
      analyses: [summary('v5-run', V5, 2000), summary('basics-run', BASICS, 1000)],
      requestId: state.requestId,
    });
    expect(els.checklist.value).toBe(BASICS);
    expect(sent('LOAD_ANALYSIS').at(-1)).toMatchObject({ analysisId: 'basics-run' });
    expect(state.analysisId).toBe('basics-run');
  });

  it("shows the newly chosen checklist's own stored analysis", async () => {
    const { els, state } = await bootPanel();
    portLog.deliver({
      type: 'HISTORY',
      analyses: [summary('v5-run', V5, 2000), summary('basics-run', BASICS, 1000)],
      requestId: state.requestId,
    });
    els.checklist.value = V5;
    els.checklist.dispatchEvent(new Event('change'));
    expect(sent('LOAD_ANALYSIS').at(-1)).toMatchObject({ analysisId: 'v5-run' });
    expect(state.analysisId).toBe('v5-run');
  });

  it('ignores a late answer about the page it has navigated away from', async () => {
    const { state } = await bootPanel();
    const before = state.requestId;
    navigate('https://example.test/b');
    portLog.deliver({
      type: 'RESULT',
      rows: [row('1', 'c')],
      scores: {
        counts: { c: 1, nc: 0, i: 0, na: 0, nt: 0 },
        automated: 1,
        total: 1,
        conformance: 1,
      },
      url: URL_A,
      analysisId: 'old',
      engineInjected: true,
      versions: { ext: '0.7.0', engine: 'e', overlay: 'o', hash: 'h' },
      requestId: before,
    });
    expect(state.rows).toEqual([]);
    expect(state.currentUrl).toBe('https://example.test/b');
    expect(state.analysisInFlight).toBe(false);
  });

  it('keeps the results when a side action fails', async () => {
    const { els, state } = await bootPanel();
    portLog.deliver({
      type: 'ANALYSIS_LOADED',
      rows: [row('1', 'c'), row('2', 'nc')],
      scores: {
        counts: { c: 1, nc: 1, i: 0, na: 0, nt: 0 },
        automated: 2,
        total: 2,
        conformance: 0.5,
      },
      requestId: state.requestId,
    });
    portLog.deliver({ type: 'ERROR', error: 'boom', request: 'REANALYZE_CRITERION' });
    expect(state.rows).toHaveLength(2);
    expect(els.body.querySelectorAll('tr[data-id]')).toHaveLength(2);
  });

  it("re-scores the rows on screen after re-testing one, the user's changes included", async () => {
    const { state } = await bootPanel();
    state.rows = [row('1', 'nc', { userModified: true, originalResult: 'c' }), row('2', 'nc')];
    // The stored analysis's scores know nothing of the change on criterion 1.
    portLog.deliver({
      type: 'CRITERION_REANALYZED',
      criterionId: '2',
      row: row('2', 'c'),
      scores: {
        counts: { c: 2, nc: 0, i: 0, na: 0, nt: 0 },
        automated: 2,
        total: 2,
        conformance: 1,
      },
    });
    expect(state.scores?.counts).toMatchObject({ c: 1, nc: 1 });
  });

  it('does not load the history after a run whose engine was blocked', async () => {
    const { els, state } = await bootPanel();
    const asked = sent('GET_HISTORY').length;
    portLog.deliver({
      type: 'RESULT',
      rows: [row('1', 'nt')],
      scores: {
        counts: { c: 0, nc: 0, i: 0, na: 0, nt: 1 },
        automated: 1,
        total: 1,
        conformance: null,
      },
      url: URL_A,
      analysisId: '',
      engineInjected: false,
      versions: { ext: '0.7.0', engine: 'e', overlay: 'o', hash: 'h' },
      requestId: state.requestId,
    });
    expect(sent('GET_HISTORY')).toHaveLength(asked);
    expect(els.engineWarning.hidden).toBe(false);
    expect(state.allAnalyses).toEqual([]);
  });

  it('keeps the Feedbacks tab, with an explanation, while feedbacks remain and participation is off', async () => {
    const { els, state } = await bootPanel({ participateFeedback: false });
    await flush();
    expect(els.tabFeedbacks.hidden).toBe(true);

    portLog.deliver({
      type: 'FEEDBACKS',
      feedbacks: [
        {
          id: 'f1',
          url: URL_A,
          criterionId: '1',
          criterionRef: '1',
          description: 'd',
          slug: BASICS,
          obtainedResult: 'c',
          kind: 'note',
          comment: 'kept',
          createdAt: 1,
          analysisId: 'a',
          analysisTimestamp: 1,
        },
      ],
    });
    expect(els.tabFeedbacks.hidden).toBe(false);
    els.tabFeedbacks.click();
    expect(state.activeTab).toBe('feedbacks');
    expect(els.fbNotice.hidden).toBe(false);
    expect(els.fbNotice.textContent).toContain('désactivée');
  });
});

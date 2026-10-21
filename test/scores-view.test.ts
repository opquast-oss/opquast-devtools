// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';

// The engine stamp is written by `npm run sync-assets` and gitignored, so pinning it here keeps the
// suite independent of a build artefact — and lets a test choose whether the displayed analysis
// agrees with the installed engine.
vi.mock('@/engine/engine-version.generated', () => ({
  ENGINE_VERSION: {
    engine: '2.0.0-alpha.1',
    submodule: '31a16d9bcb',
    overlay: '0.6.0',
    hash: 'a3f1c8',
    fullHash: 'a3f1c8'.padEnd(64, '0'),
  },
}));
import { loadPanelContext } from './helpers/panel';
import type { Scores, Status } from '@/lib/types';
import type { AnalysisSummary } from '@/lib/result-store';

function scores(c: number, nc: number): Scores {
  const counts: Record<Status, number> = { c, nc, i: 0, na: 0, nt: 0 };
  const decided = c + nc;
  return { counts, automated: decided, total: decided, conformance: decided ? c / decided : null };
}

// Load context + scores-view sharing the same fresh module instance, and expose both.
async function loadScoresView() {
  const context = await loadPanelContext();
  const view = await import('@/entrypoints/panel/scores-view');
  return { ...context, ...view };
}

/** A stored-analysis summary as the HISTORY message delivers it. */
function summary(id: string, slug: string, timestamp: number, s: Scores): AnalysisSummary {
  const versions = { ext: '', engine: '', overlay: '', hash: '' };
  return {
    id,
    url: 'https://example.test/',
    slug,
    lang: 'fr',
    timestamp,
    scores: s,
    hasOverrides: false,
    versions,
  };
}

describe('renderScoresView — multi-checklist breakdown', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('shows a row per enabled checklist and reflects the analysis scores', async () => {
    const { els, state, renderScoresView } = await loadScoresView();

    els.checklist.innerHTML =
      '<option value="900-opquast-v5">Opquast V5</option>' +
      '<option value="901-opquast-basics">Opquast Basics</option>';
    els.checklist.value = '900-opquast-v5';

    state.manifest = [
      { slug: '900-opquast-v5', names: { fr: 'Opquast V5' }, langs: ['fr'] },
      { slug: '901-opquast-basics', names: { fr: 'Opquast Basics' }, langs: ['fr'] },
    ];
    state.scores = scores(8, 2);
    state.allAnalyses = [
      summary('a', '900-opquast-v5', 2, scores(8, 2)),
      summary('b', '901-opquast-basics', 2, scores(5, 5)),
    ];

    renderScoresView();

    const html = els.scoreBreakdown.innerHTML;
    expect(html).toContain('Opquast V5');
    expect(html).toContain('Opquast Basics');
    // V5 = 8/(8+2) = 8.0, Basics = 5/10 = 5.0
    expect(html).toContain('8.0');
    expect(html).toContain('5.0');
  });

  it('excludes a previously-analyzed checklist that is no longer ticked', async () => {
    const { els, state, renderScoresView } = await loadScoresView();

    // Only V5 is enabled (in the dropdown).
    els.checklist.innerHTML = '<option value="900-opquast-v5">Opquast V5</option>';
    els.checklist.value = '900-opquast-v5';

    state.manifest = [
      { slug: '900-opquast-v5', names: { fr: 'Opquast V5' }, langs: ['fr'] },
      { slug: '901-opquast-basics', names: { fr: 'Opquast Basics' }, langs: ['fr'] },
    ];
    state.scores = scores(8, 2);
    // History still contains a stale Basics analysis, but Basics is no longer ticked.
    state.allAnalyses = [
      summary('a', '900-opquast-v5', 2, scores(8, 2)),
      summary('b', '901-opquast-basics', 1, scores(5, 5)),
    ];

    renderScoresView();

    const html = els.scoreBreakdown.innerHTML;
    expect(html).toContain('Opquast V5');
    expect(html).not.toContain('Opquast Basics');
  });

  it('keeps only the most recent analysis per checklist', async () => {
    const { els, state, renderScoresView } = await loadScoresView();

    els.checklist.innerHTML = '<option value="900-opquast-v5">Opquast V5</option>';
    els.checklist.value = '900-opquast-v5';
    state.manifest = [{ slug: '900-opquast-v5', names: { fr: 'Opquast V5' }, langs: ['fr'] }];
    state.scores = scores(9, 1);
    state.allAnalyses = [
      summary('old', '900-opquast-v5', 1, scores(1, 9)), // 1.0
      summary('new', '900-opquast-v5', 2, scores(9, 1)), // 9.0
    ];

    renderScoresView();

    const html = els.scoreBreakdown.innerHTML;
    expect(html).toContain('9.0');
    expect(html).not.toContain('1.0');
  });

  it('clears the breakdown when there are no scores', async () => {
    const { els, state, renderScoresView } = await loadScoresView();
    state.scores = null;
    renderScoresView();
    expect(els.scoreBreakdown.innerHTML).toBe('');
    expect(els.globalScore.textContent).toContain('--');
  });
});

describe('updateToolbarInfo — engine stamp', () => {
  const stamp = { ext: '0.6.0', engine: '2.0.0-alpha.1', overlay: '0.6.0', hash: 'a3f1c8' };

  it('keeps the engine out of the visible line and puts it in the tooltip', async () => {
    const { state, els, updateToolbarInfo } = await loadScoresView();
    state.analysisTimestamp = Date.UTC(2026, 8, 6, 12, 0, 0);
    state.analysisDuration = 3200;
    state.versions = { ...stamp };

    updateToolbarInfo();

    // The bar is already tight, and the stamp is identical for every result on screen.
    expect(els.analysisInfo.textContent).not.toContain('a3f1c8');
    expect(els.analysisInfo.title).toContain('2.0.0-alpha.1');
    expect(els.analysisInfo.title).toContain('a3f1c8');
  });

  it('makes the stamp visible when the analysis predates the installed engine', async () => {
    const { state, els, updateToolbarInfo } = await loadScoresView();
    state.analysisTimestamp = Date.UTC(2026, 8, 6, 12, 0, 0);
    // A result restored from history, produced by an engine that is no longer the installed one.
    state.versions = { ...stamp, hash: '9c02de', engine: '1.9.0' };

    updateToolbarInfo();

    expect(els.analysisInfo.textContent).toContain('9c02de');
  });

  it('says the engine is untraced for an analysis older than 0.6', async () => {
    const { state, els, updateToolbarInfo } = await loadScoresView();
    state.analysisTimestamp = Date.UTC(2026, 8, 6, 12, 0, 0);
    state.versions = { ext: '', engine: '', overlay: '', hash: '' };

    updateToolbarInfo();

    expect(els.analysisInfo.title).toMatch(/non tracé|not traced/);
  });
});

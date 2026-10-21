// Scores tab + score-derived chrome: the global badge, the per-checklist breakdown, the tab labels
// (with the mini score badge) and the toolbar "analysis of …" info line.

import { els, state } from './context';
import { checklistName } from '@/lib/checklists';
import { t, type Lang, type StringKey } from '@/lib/ui-strings';
import type { Scores } from '@/lib/types';
import type { AnalysisSummary } from '@/lib/result-store';
import { esc } from './html';
import { currentVersions, formatVersions, sameEngine } from '@/lib/versions';

export function renderScoresView() {
  const s = state.scores;

  if (!s) {
    els.globalScore.className = 'score-badge';
    els.globalScore.innerHTML = `<span class="score-value">--</span><span class="score-suffix">/10</span>`;
    els.scoreDetails.innerHTML = '';
    els.scoreBreakdown.innerHTML = '';
    return;
  }

  const L = state.lang;
  const scoreClass = scoreLevel(s.conformance);
  els.globalScore.className = `score-badge ${scoreClass}`;
  els.globalScore.innerHTML = `<span class="score-value">${scoreOutOf10(s.conformance)}</span><span class="score-suffix">/10</span>`;

  // "X tests passed  Y tests failed" — clickable links to the filtered results
  els.scoreDetails.innerHTML = filterLinks(
    L,
    s.counts.c,
    s.counts.nc,
    'scorePassTests',
    'scoreFailTests',
  );

  // Build breakdown for the currently enabled checklists tested on this URL. Restrict to the slugs
  // offered in the dropdown (= the ticked referentials) so a previously-analyzed but since-unticked
  // checklist doesn't linger, and keep only the most recent analysis per checklist.
  const enabledSlugs = new Set([...els.checklist.options].map((o) => o.value));
  const analysesBySlug = new Map<string, AnalysisSummary>();
  for (const a of state.allAnalyses) {
    if (!enabledSlugs.has(a.slug)) continue;
    if (!analysesBySlug.has(a.slug) || a.timestamp > (analysesBySlug.get(a.slug)?.timestamp ?? 0)) {
      analysesBySlug.set(a.slug, a);
    }
  }

  // If no allAnalyses, show current checklist only
  if (analysesBySlug.size === 0) {
    const name = checklistName(state.manifest, els.checklist.value, L);
    els.scoreBreakdown.innerHTML = scoreRow(L, name, s, false);
    return;
  }

  // Render all checklists
  let breakdownHtml = '';
  for (const [slug, analysis] of analysesBySlug) {
    const name = checklistName(state.manifest, slug, L);
    breakdownHtml += scoreRow(L, name, analysis.scores, slug === els.checklist.value);
  }

  els.scoreBreakdown.innerHTML = breakdownHtml;
}

/** Score band, used as a CSS class: under 4/10 is low, under 7/10 medium, else high. */
function scoreLevel(conformance: number | null | undefined): '' | 'low' | 'medium' | 'high' {
  if (conformance === null || conformance === undefined) return '';
  const score = conformance * 10;
  return score < 4 ? 'low' : score < 7 ? 'medium' : 'high';
}

function scoreOutOf10(conformance: number | null | undefined): string {
  return conformance === null || conformance === undefined ? '--' : (conformance * 10).toFixed(1);
}

function filterLinks(L: Lang, c: number, nc: number, pass: StringKey, fail: StringKey): string {
  return `
    <button type="button" class="filter-link conformes" data-filter="c">${t(L, pass).replace('{n}', String(c))}</button>
    <button type="button" class="filter-link non-conformes" data-filter="nc">${t(L, fail).replace('{n}', String(nc))}</button>`;
}

/** One line of the per-checklist breakdown: name, score badge, pass/fail links. */
function scoreRow(L: Lang, name: string, scores: Scores, current: boolean): string {
  return `
    <div class="score-row${current ? ' current-checklist' : ''}">
      <span class="score-label-text">${esc(name)}</span>
      <span class="score-badge ${scoreLevel(scores.conformance)}"><span class="score-value">${scoreOutOf10(scores.conformance)}</span><span class="score-suffix">/10</span></span>
      <span class="score-details">${filterLinks(L, scores.counts.c, scores.counts.nc, 'scorePass', 'scoreFail')}</span>
    </div>`;
}

export function updateTabLabels() {
  const L = state.lang;
  if (state.scores && state.scores.conformance !== null && state.scores.conformance !== undefined) {
    const conformance = state.scores.conformance;
    const score = (conformance * 10).toFixed(1);
    els.tabScores.innerHTML = `${t(L, 'tabScores')} <span class="score-badge-mini ${scoreLevel(conformance)}">${score}/10</span>`;
  } else {
    els.tabScores.textContent = t(L, 'tabScores');
  }
  els.tabResults.textContent = t(L, 'tabResults');
  const fbCount = state.feedbacks.length + state.appFeedbacks.length;
  els.tabFeedbacks.textContent = fbCount
    ? `${t(L, 'tabFeedbacks')} (${fbCount})`
    : t(L, 'tabFeedbacks');
  // Turning participation off stops new feedback, it does not take away what is stored: the tab
  // stays while feedbacks remain (to export or delete them), and says why (see renderFeedbacks).
  els.tabFeedbacks.hidden =
    !state.participateFeedback && fbCount === 0 && state.activeTab !== 'feedbacks';
  els.tabAbout.textContent = t(L, 'tabAbout');
}

export function updateToolbarInfo() {
  if (!state.analysisTimestamp) {
    els.analysisInfo.textContent = '';
    els.relaunch.hidden = true;
    return;
  }

  const date = new Date(state.analysisTimestamp);
  const locale = state.lang === 'fr' ? 'fr-FR' : 'en-US';

  // Format: "4 juin 2026" / "June 4, 2026"
  const dateStr = date.toLocaleDateString(locale, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  const timeStr = date.toLocaleTimeString(locale, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  let text = `${t(state.lang, 'analysisOf')} ${dateStr} ${t(state.lang, 'at')} ${timeStr}`;
  if (state.analysisDuration !== null) {
    text += ` (${(state.analysisDuration / 1000).toFixed(1)}s)`;
  }

  // The engine goes in the tooltip, not the line: this bar is already tight, and the stamp is
  // the same for every result on screen. The one case a human must be told is when the displayed
  // analysis was produced by an engine other than the installed one — then, and only then, it
  // becomes visible.
  els.analysisInfo.title = formatVersions(state.versions ?? undefined, state.lang);
  if (state.versions && !sameEngine(state.versions, currentVersions())) {
    text += ` · ${t(state.lang, 'versionEngine')} ${state.versions.hash} (${t(state.lang, 'versionMismatch')})`;
  }

  els.analysisInfo.textContent = text;
  els.relaunch.hidden = false;
}

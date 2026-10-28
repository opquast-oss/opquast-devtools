// DevTools panel controller (orchestrator): boots the UI, drives analysis via the background port,
// dispatches port responses, and wires prefs/lifecycle. Rendering + mutations live in sibling modules
// (scores-view, table-view, modal-view, feedbacks-view, mutations); shared els/state/port in context.
import {
  checklistName,
  DEFAULT_SLUG,
  loadChecklistManifest,
  pickLang,
  shippedSelection,
} from '@/lib/checklists';
import { populateChecklistDropdown } from '@/lib/checklist-ui';
import { getPrefs, onPrefsChanged, setPrefs, type Prefs } from '@/lib/prefs';
import { localizeDocument, t, type Lang, type StringKey } from '@/lib/ui-strings';
import { buildCsv } from '@/lib/csv';
import type { Status } from '@/lib/types';
import { computeScores } from '@/lib/scoring';
import type { BgResponse } from '@/lib/messages';
import type { AnalysisSummary } from '@/lib/result-store';

import { els, state, port } from './context';
import { renderScoresView, updateTabLabels, updateToolbarInfo } from './scores-view';
import { renderTable, wireSorting } from './table-view';
import { setupModal, openModal, closeModal, renderModalDetail } from './modal-view';
import { setupFeedbacks, renderFeedbacks, loadAppFeedbacks, toast } from './feedbacks-view';
import { renderAbout } from './about-view';
import { downloadText, fileDate, fileHost, fileName } from './download';
import { renderAccessError } from './access-view';
import { inspectedUrl } from './inspected';
import { isAccessFailure, isAnalysableUrl, type AccessFailure } from '@/lib/page-access';

// ---- init ----------------------------------------------------------------
void init();

let analysisStartTime = 0;
let analysisTimeout: ReturnType<typeof setTimeout> | null = null;
const ANALYSIS_TIMEOUT_MS = 30_000; // 30 seconds timeout for analysis

async function init() {
  await initChecklists();
  const prefs = await getPrefs();
  applyPrefs(prefs);
  onPrefsChanged(applyPrefs);

  // Setup new UI
  setupTabs();
  setupModal();
  setupToolbar();
  setupDisplayDropdown();
  setupScoresLinks();
  setupFeedbacks();
  wireSorting();

  // Follow the inspected tab: when it navigates, re-align the panel to the new page.
  browser.devtools.network.onNavigated.addListener(onTabNavigated);

  // Load feedbacks up front so the duplicate guard in sendFeedback has the current list, and the
  // app feedbacks so the tab count includes them.
  requestFeedbacks();
  void loadAppFeedbacks();

  if (prefs.autoRun) {
    // Auto-launch the analysis when the panel opens.
    showLoading();
    void autoLaunchAnalysis();
  } else {
    // Don't auto-run: hide the spinner, expose the launch button + empty-state prompt,
    // and load the latest stored analysis for this URL if there is one.
    els.loadingOverlay.hidden = true;
    els.relaunch.hidden = false;
    switchTab('results');
    void loadLastAnalysis();
  }
}

/** The inspected tab navigated to a new page: reset the panel to it, then re-align per the pref. */
function onTabNavigated(url: string) {
  closeModal();
  // Whatever was asked about the previous page is now stale: its answers will be ignored, and a
  // run still in flight there must not block the run for this page.
  state.requestId++;
  state.analysisInFlight = false;
  clearAnalysisTimeout();
  state.currentUrl = url;
  state.analysisId = null;
  state.selectedId = null;
  state.rows = [];
  state.scores = null;
  state.allAnalyses = [];
  state.analysisTimestamp = null;
  state.analysisDuration = null;
  state.versions = null;
  state.revisions = [];
  els.engineWarning.textContent = '';
  els.engineWarning.hidden = true;
  els.exportCsv.disabled = true;
  renderTable();
  renderScoresView();
  updateToolbarInfo();

  if (state.autoRun) {
    showLoading();
    runAnalysis();
  } else {
    els.loadingOverlay.hidden = true;
    els.relaunch.hidden = false;
    switchTab('results');
    void loadLastAnalysis();
  }
}

function setupToolbar() {
  els.relaunch.addEventListener('click', () => runAnalysis());

  els.settingsBtn.addEventListener('click', () => {
    // Use port to ask background to open options (works in all contexts)
    port.postMessage({ type: 'OPEN_OPTIONS' });
  });
}

function setupDisplayDropdown() {
  // Toggle dropdown
  const setMenu = (open: boolean) => {
    els.displayMenu.hidden = !open;
    els.displayToggle.setAttribute('aria-expanded', String(open));
  };
  els.displayToggle.addEventListener('click', (e) => {
    e.stopPropagation();
    setMenu(els.displayMenu.hidden);
  });

  // Close dropdown when clicking outside, or on Escape (focus back on its button)
  document.addEventListener('click', () => setMenu(false));
  els.displayMenu.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    e.stopPropagation();
    setMenu(false);
    els.displayToggle.focus();
  });

  // Prevent closing when clicking inside dropdown
  els.displayMenu.addEventListener('click', (e) => {
    e.stopPropagation();
  });

  // Column visibility toggles (persisted in prefs)
  els.showThemas.addEventListener('change', () => {
    state.showThemas = els.showThemas.checked;
    document.body.classList.toggle('hide-thema', !state.showThemas);
    void setPrefs({ showThemas: state.showThemas });
    renderTable();
  });

  els.showTags.addEventListener('change', () => {
    state.showTags = els.showTags.checked;
    document.body.classList.toggle('hide-tags', !state.showTags);
    void setPrefs({ showTags: state.showTags });
    renderTable();
  });

  // Result filter toggles
  for (const [status, box] of statusFilters()) {
    box.addEventListener('change', () => {
      if (box.checked) state.hiddenStatuses.delete(status);
      else state.hiddenStatuses.add(status);
      renderTable();
    });
  }
}

/** The "Show" menu's status checkboxes. */
function statusFilters(): [Status, HTMLInputElement][] {
  return [
    ['c', els.showC],
    ['nc', els.showNc],
    ['i', els.showI],
    ['na', els.showNa],
    ['nt', els.showNt],
  ];
}

// ---- Scores → Results navigation -------------------------------------------
/** Wire the clickable "X conformes" / "Y non conformes" links in the Scores tab. */
function setupScoresLinks() {
  els.panelScores.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest('[data-filter]');
    if (btn) {
      const status = btn.getAttribute('data-filter') as Status;
      filterAndSwitchToResults(status);
    }
  });
}

/** Apply a single-status filter and navigate to the Results tab. */
function filterAndSwitchToResults(status: Status) {
  // "12 failed" must show those twelve: a search left in the box would hide some of them.
  state.search = '';
  els.search.value = '';
  state.hiddenStatuses.clear();
  for (const [s, box] of statusFilters()) {
    box.checked = s === status;
    if (s !== status) state.hiddenStatuses.add(s);
  }
  switchTab('results');
  renderTable();
}

async function autoLaunchAnalysis() {
  // Run even when the URL cannot be read: the background then tells why it cannot reach the page.
  state.currentUrl = (await inspectedUrl()) ?? '';
  runAnalysis();
}

function showLoading() {
  els.loadingOverlay.hidden = false;
  els.panelScores.hidden = true;
  els.panelResults.hidden = true;
  els.panelFeedbacks.hidden = true;
  els.panelAbout.hidden = true;
}

function hideLoading() {
  els.loadingOverlay.hidden = true;
  els.relaunch.hidden = false; // Always show relaunch button when loading ends
  clearAnalysisTimeout();
  showActivePanel();
}

function clearAnalysisTimeout() {
  if (analysisTimeout) {
    clearTimeout(analysisTimeout);
    analysisTimeout = null;
  }
}

function startAnalysisTimeout() {
  clearAnalysisTimeout();
  analysisTimeout = setTimeout(() => {
    // Analysis timed out - likely the background wasn't ready or message was lost
    state.analysisInFlight = false;
    hideLoading();
    showTableMessage('runTimedOut');
    console.warn('Opquast: Analysis timed out - background may not have been ready');
  }, ANALYSIS_TIMEOUT_MS);
}

async function loadLastAnalysis() {
  const url = await inspectedUrl();
  if (!url) return; // nothing to restore against
  state.currentUrl = url;
  port.postMessage({ type: 'GET_HISTORY', url, requestId: state.requestId });
}

function applyPrefs(stored: Prefs) {
  const p = {
    ...stored,
    ...shippedSelection(state.manifest, stored.enabledChecklists, stored.slug),
  };
  state.lang = (p.lang === 'en' ? 'en' : 'fr') as Lang;
  populateChecklistDropdown(els.checklist, state.manifest, p.enabledChecklists, state.lang, {
    defaultSlug: DEFAULT_SLUG,
  });
  if (state.manifest.some((c) => c.slug === p.slug)) els.checklist.value = p.slug;
  syncChecklistSelector();
  els.lang.value = p.lang;
  state.autoRun = p.autoRun; // kept in sync for the navigation handler
  state.participateFeedback = p.participateFeedback;

  // Sync display dropdown with prefs
  state.showThemas = p.showThemas;
  state.showTags = p.showTags ?? true;
  els.showThemas.checked = p.showThemas;
  els.showTags.checked = state.showTags;
  document.body.classList.toggle('hide-thema', !p.showThemas);
  document.body.classList.toggle('hide-tags', !state.showTags);

  localizeStatic(); // updateTabLabels() decides whether the Feedbacks tab shows
  if (els.tabFeedbacks.hidden && state.activeTab === 'feedbacks') switchTab('scores');
  renderTable();
  renderScoresView();
}

/**
 * With a single enabled checklist there is nothing to pick. Instead of disabling the listbox,
 * we leave it enabled so clicks are detected and redirect to the settings page where the user
 * can enable more checklists.
 */
function syncChecklistSelector() {
  const isSingle = els.checklist.options.length <= 1;
  els.checklist.classList.toggle('single-checklist', isSingle);
}

// ---- Tab management --------------------------------------------------------
function setupTabs() {
  els.tabScores.addEventListener('click', () => switchTab('scores'));
  els.tabResults.addEventListener('click', () => switchTab('results'));
  els.tabFeedbacks.addEventListener('click', () => switchTab('feedbacks'));
  els.tabAbout.addEventListener('click', () => switchTab('about'));
  // ARIA tabs pattern: arrows, Home and End move between the visible tabs and activate them.
  const ids: Record<string, typeof state.activeTab> = {
    'tab-scores': 'scores',
    'tab-results': 'results',
    'tab-feedbacks': 'feedbacks',
    'tab-about': 'about',
  };
  els.tabScores.parentElement!.addEventListener('keydown', (e) => {
    const tabs = [els.tabScores, els.tabResults, els.tabFeedbacks, els.tabAbout].filter(
      (b) => !b.hidden,
    );
    const at = tabs.indexOf(document.activeElement as HTMLButtonElement);
    if (at === -1) return;
    const next =
      e.key === 'ArrowRight'
        ? tabs[(at + 1) % tabs.length]
        : e.key === 'ArrowLeft'
          ? tabs[(at - 1 + tabs.length) % tabs.length]
          : e.key === 'Home'
            ? tabs[0]
            : e.key === 'End'
              ? tabs[tabs.length - 1]
              : undefined;
    if (!next) return;
    e.preventDefault();
    switchTab(ids[next.id]!);
    next.focus();
  });
  els.chooseChecklists.addEventListener('click', (e) => {
    e.preventDefault();
    // openOptionsPage() is unavailable from the DevTools panel context — ask the background to do it
    // (same path as the ⚙ settings button).
    port.postMessage({ type: 'OPEN_OPTIONS' });
  });
}

function switchTab(tab: 'scores' | 'results' | 'feedbacks' | 'about') {
  state.activeTab = tab;
  showActivePanel();
  if (tab === 'feedbacks') {
    requestFeedbacks();
    void loadAppFeedbacks();
  } else if (tab === 'about') {
    renderAbout();
  }
}

function showActivePanel() {
  const tabs: [typeof state.activeTab, HTMLElement, HTMLElement][] = [
    ['scores', els.tabScores, els.panelScores],
    ['results', els.tabResults, els.panelResults],
    ['feedbacks', els.tabFeedbacks, els.panelFeedbacks],
    ['about', els.tabAbout, els.panelAbout],
  ];
  for (const [name, tab, panel] of tabs) {
    const active = name === state.activeTab;
    tab.classList.toggle('active', active);
    tab.setAttribute('aria-selected', String(active));
    tab.tabIndex = active ? 0 : -1;
    panel.hidden = !active;
  }
}

function requestFeedbacks() {
  port.postMessage({ type: 'GET_FEEDBACKS' });
}

// ---- Event listeners -------------------------------------------------------

// When only one checklist is enabled, clicking the dropdown opens settings instead of showing
// a useless single-item menu. We intercept mousedown to prevent the native dropdown from opening.
els.checklist.addEventListener('mousedown', (e) => {
  if (els.checklist.options.length <= 1) {
    e.preventDefault();
    port.postMessage({ type: 'OPEN_OPTIONS' });
  }
});

els.checklist.addEventListener('change', () => {
  void setPrefs({ slug: els.checklist.value });
  showChecklist(els.checklist.value);
});

/**
 * Show `slug`'s results for the current page: every enabled checklist is analysed in the same
 * run, so its stored analysis is normally there. Without one, the table is emptied rather than
 * left showing another checklist's rows under this one's name.
 */
function showChecklist(slug: string) {
  const stored = state.allAnalyses.find((a) => a.slug === slug);
  if (stored) {
    selectAnalysis(stored);
    return;
  }
  if (!state.rows.length) return;
  closeModal();
  state.rows = [];
  state.scores = null;
  state.analysisId = null;
  state.versions = null;
  state.revisions = [];
  els.exportCsv.disabled = true;
  updateTabLabels();
  renderScoresView();
  renderTable();
}

/** Make `a` the analysis on screen: its id and stamps now, its rows when ANALYSIS_LOADED comes. */
function selectAnalysis(a: AnalysisSummary) {
  // Key on the loaded analysis's page + id (so overrides/comments and per-criterion re-run work).
  if (a.url) state.currentUrl = a.url;
  state.analysisId = a.id;
  state.analysisTimestamp = a.timestamp;
  // A feedback filed on these rows must carry the stamp of the analysis that produced them.
  state.versions = a.versions ?? null;
  state.revisions = a.revisions ?? [];
  port.postMessage({ type: 'LOAD_ANALYSIS', analysisId: a.id, requestId: state.requestId });
}
// The new language reaches applyPrefs() through onPrefsChanged, which re-localizes everything.
els.lang.addEventListener('change', () => void setPrefs({ lang: els.lang.value }));
els.exportCsv.addEventListener('click', exportCsv);

function exportCsv() {
  if (!state.rows.length) return;
  const slug = els.checklist.value;
  const name = checklistName(state.manifest, slug, state.lang);
  const csv = buildCsv(state.rows, state.lang, name);
  // Host and date of the analysis: two exports no longer overwrite each other in Downloads.
  const date = state.analysisTimestamp ? fileDate(state.analysisTimestamp) : '';
  downloadText(fileName(['opquast', slug, fileHost(state.currentUrl), date], 'csv'), csv);
}

els.search.addEventListener('input', () => {
  state.search = els.search.value.trim().toLowerCase();
  renderTable();
});

// ---- Message handling ------------------------------------------------------
port.onMessage.addListener((msg: BgResponse) => {
  // An answer about a page or run the panel has since left (navigation, relaunch after a timeout).
  if (msg?.requestId !== undefined && msg.requestId !== state.requestId) return;
  if (msg?.type === 'RESULT') {
    state.analysisInFlight = false; // run settled — allow the next analysis
    state.rows = msg.rows;
    state.scores = msg.scores;
    state.selectedId = null;
    state.analysisId = msg.analysisId ?? null;
    state.analysisTimestamp = Date.now();
    state.versions = msg.versions ?? null;
    state.revisions = []; // a fresh run: every row comes from the engine just stamped

    state.analysisDuration = analysisStartTime > 0 ? Date.now() - analysisStartTime : null;

    // Key everything (overrides/comments, feedbacks, history) on the URL that was actually analyzed.
    state.currentUrl = msg.url ?? state.currentUrl;
    els.exportCsv.disabled = state.rows.length === 0;

    // Distinguish "engine couldn't run here" (blocked injection → all-nt) from a genuine analysis.
    els.engineWarning.textContent = msg.engineInjected ? '' : t(state.lang, 'engineNotInjected');
    els.engineWarning.hidden = msg.engineInjected;

    // Hide loading and update UI
    hideLoading();
    els.chooseChecklists.hidden = false; // hidden by a previous access error
    els.srStatus.textContent = t(state.lang, 'srAnalysisDone').replace(
      '{n}',
      String(state.rows.length),
    );
    updateToolbarInfo();
    updateTabLabels();
    renderScoresView();
    renderTable();

    // Request all analyses for this URL to update multi-checklist scores. A run whose engine was
    // blocked is not stored: loading the history would put an older analysis in its place.
    if (!msg.engineInjected) {
      state.allAnalyses = [];
      renderScoresView();
    } else if (state.currentUrl) {
      port.postMessage({
        type: 'GET_HISTORY',
        url: state.currentUrl,
        requestId: state.requestId,
      });
    }

    // Auto-switch to results tab after analysis
    switchTab('results');
  } else if (msg?.type === 'OVERRIDE_SET' || msg?.type === 'OVERRIDE_CLEARED') {
    if (state.selectedId && state.modalOpen) {
      renderModalDetail();
    }
    renderTable();
    renderScoresView();
    updateTabLabels();
  } else if (msg?.type === 'CRITERION_REANALYZED') {
    const idx = state.rows.findIndex((r) => r.id === msg.criterionId);
    if (idx !== -1 && msg.row) state.rows[idx] = msg.row;
    // msg.scores are the stored analysis's, without the user's changes on other criteria: score
    // the rows on screen instead, as every other update does.
    state.scores = computeScores(state.rows);
    renderTable();
    renderScoresView();
    updateTabLabels();
    if (state.modalOpen && state.selectedId === msg.criterionId) renderModalDetail();
  } else if (msg?.type === 'FEEDBACKS') {
    state.feedbacks = msg.feedbacks ?? [];
    renderFeedbacks();
    updateTabLabels();
  } else if (msg?.type === 'FEEDBACK_SAVED') {
    // Always refresh so state.feedbacks stays current for the duplicate guard.
    requestFeedbacks();
  } else if (msg?.type === 'FEEDBACK_DELETED' || msg?.type === 'FEEDBACKS_CLEARED') {
    requestFeedbacks();
  } else if (msg?.type === 'HISTORY') {
    const analyses = msg.analyses;
    // Store all analyses for multi-checklist display
    state.allAnalyses = analyses;
    renderScoresView();

    // The newest analysis of the ACTIVE checklist, not blindly analyses[0]: every enabled
    // checklist is stored by the same run, so the newest record is often another checklist's.
    // Only when the active one has none does the panel switch to the newest one available.
    const latest = analyses?.[0];
    let shown = analyses?.find((a) => a.slug === els.checklist.value);
    if (!shown && latest && [...els.checklist.options].some((o) => o.value === latest.slug)) {
      els.checklist.value = latest.slug;
      shown = latest;
    }
    if (shown) selectAnalysis(shown);
  } else if (msg?.type === 'ANALYSIS_LOADED') {
    state.rows = msg.rows;
    state.scores = msg.scores;
    state.selectedId = null;
    els.exportCsv.disabled = state.rows.length === 0;

    // A user-launched run may be under way: its overlay and timeout stay until it answers.
    if (!state.analysisInFlight) hideLoading();
    els.chooseChecklists.hidden = false;
    updateToolbarInfo();
    updateTabLabels();
    renderScoresView();
    renderTable();
  } else if (msg?.type === 'ERROR' && msg.request && msg.request !== 'ANALYZE') {
    // A side action failed (re-test, override, feedback…): the results on screen are still valid.
    console.error('Opquast:', msg.request, msg.error);
    toast(t(state.lang, 'actionFailed'));
    if (state.modalOpen) renderModalDetail(); // re-enables a re-test button left "Running…"
  } else if (msg?.type === 'ERROR') {
    state.analysisInFlight = false; // run failed — allow a retry
    els.srStatus.textContent = t(state.lang, 'srAnalysisFailed');
    hideLoading();
    els.relaunch.hidden = false; // always expose "Relancer" so the user can retry after a failure

    if (isAccessFailure(msg.error)) {
      showAccessError(msg.error, msg.detail);
    } else {
      // Other errors: show in modal
      showTableMessage('runFailed');
      const pre = document.createElement('pre');
      pre.className = 'error';
      pre.textContent = msg.error;
      els.detailContent.replaceChildren(pre);
      openModal('error');
    }
  }
});

async function initChecklists() {
  try {
    state.manifest = await loadChecklistManifest();
  } catch (e) {
    console.error(`manifest: ${String(e)}`);
  }
}

/** Replace the Results table (still saying "Injecting engine…") once a run ends without rows. */
function showTableMessage(key: StringKey) {
  const td = document.createElement('td');
  td.colSpan = 5;
  td.textContent = t(state.lang, key);
  const tr = document.createElement('tr');
  tr.className = 'empty';
  tr.append(td);
  els.body.replaceChildren(tr);
}

/** Explain, in the Scores panel, why the engine could not reach the page (see lib/page-access). */
function showAccessError(code: AccessFailure, detail?: string) {
  showTableMessage('runFailedAccess');
  switchTab('scores');
  renderAccessError(els.scoreBreakdown, code, {
    lang: state.lang,
    isFirefox: import.meta.env.BROWSER === 'firefox',
    detail,
    onOpenSettings: () => port.postMessage({ type: 'OPEN_OPTIONS' }),
  });
  els.chooseChecklists.hidden = true;
}

function runAnalysis() {
  // Guard against overlapping runs: button, autorun and onTabNavigated can all trigger this, and two
  // in-flight analyses race on executeScript, producing interleaved results. Ignore a new run until
  // the current one settles (RESULT / ERROR clear the flag).
  if (state.analysisInFlight) return;
  // about:, chrome:, view-source:… no extension may run there: say so instead of trying.
  if (state.currentUrl && !isAnalysableUrl(state.currentUrl)) {
    hideLoading();
    showAccessError('PAGE_RESTRICTED');
    return;
  }
  state.analysisInFlight = true;
  state.requestId++; // answers of an earlier run (timed out, then late) no longer apply

  const slug = els.checklist.value;
  const info = state.manifest.find((c) => c.slug === slug);
  const lang = info ? pickLang(info, els.lang.value) : els.lang.value;

  // All enabled checklists (the dropdown is already filtered to them) are analyzed in one pass so the
  // scores breakdown covers every ticked referential; `slug` stays the active one for the table.
  const slugs = [...els.checklist.options].map((o) => o.value);

  // Record start time for duration calculation
  analysisStartTime = Date.now();

  // Show loading overlay and start timeout (in case background isn't ready)
  showLoading();
  startAnalysisTimeout();

  showTableMessage('running');
  port.postMessage({
    type: 'ANALYZE',
    tabId: browser.devtools.inspectedWindow.tabId,
    slug,
    slugs,
    lang,
    url: state.currentUrl || undefined,
    requestId: state.requestId,
  });
}

// ---- Localization ----
function localizeStatic() {
  localizeDocument(state.lang);
  renderFeedbacks();
  renderAbout();
  updateTabLabels();
}

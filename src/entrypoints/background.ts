import {
  ENGINE_FILES,
  loadJSON,
  subsetRulesets,
  type ChecklistFile,
  type Rules,
  type Rulesets,
} from '@/lib/engine-assets';
import { runEngineInPage, type EngineResult } from '@/engine/run-in-page';
import { buildResults, projectChecklists } from '@/engine/launch-tests';
import { computeScores } from '@/lib/scoring';
import type { EngineRow, RecoveredInputs, ResultRow, Scores } from '@/lib/types';
import { fetchMainDocument, refetchResources, toResources } from '@/recovery/refetch-service';
import type { BgResponse, PanelRequest } from '@/lib/messages';
import { probeRoot } from '@/recovery/probe-service';
import { scanDomResources } from '@/recovery/scan-dom';
import { currentVersions } from '@/lib/versions';
import {
  classifyAccessFailure,
  isAccessError,
  isAnalysableUrl,
  isTabReady,
  originPattern,
  type AccessFailure,
} from '@/lib/page-access';
import {
  storeAnalysis,
  listAnalyses,
  getCombinedResults,
  mergeWithOverrides,
  setOverride,
  clearOverride,
  updateAnalysisCriterion,
  recordFeedback,
  listFeedbacks,
  updateFeedback,
  removeFeedback,
  clearAllFeedbacks,
} from '@/lib/result-store';

// How long to wait for the inspected tab to finish loading before analysing it anyway.
const TAB_READY_TIMEOUT_MS = 15_000;
const TAB_READY_POLL_MS = 200;

// What the engine is given: page resources are re-fetched, inline on* handlers are read from the
// DOM. Listeners added with addEventListener cannot be seen, so the rules that need them are
// reported "not tested" (see launch-tests.ts).
const RECOVERED: RecoveredInputs = { events: false, resources: true };

// Background router. Stateless per request so the SW (Chrome) / event page (Firefox) can suspend.
export default defineBackground(() => {
  browser.runtime.onConnect.addListener((port) => {
    if (port.name !== 'oqs-panel') return;
    port.onMessage.addListener(async (msg: PanelRequest) => {
      // Echoed on every answer: the panel ignores those about a page or a run it has left.
      const tracking = { requestId: msg?.requestId, request: msg?.type };
      try {
        const reply = await handle(msg);
        if (reply) port.postMessage({ ...reply, requestId: msg?.requestId });
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        console.error('Opquast:', e);
        // The browser refused access to the tab: find out why before telling the user what to do.
        if (isAccessError(message) && msg && 'tabId' in msg) {
          const url = 'url' in msg ? msg.url : undefined;
          port.postMessage({
            type: 'ERROR',
            error: await diagnoseAccess(msg.tabId, url),
            detail: message,
            ...tracking,
          });
        } else {
          port.postMessage({
            type: 'ERROR',
            error: `${message}\n${(e as Error).stack ?? ''}`,
            ...tracking,
          });
        }
      }
    });
  });
});

async function handle(msg: PanelRequest): Promise<BgResponse | undefined> {
  switch (msg?.type) {
    case 'PING':
      return { type: 'PONG', tabId: msg.tabId };
    case 'ANALYZE':
      return { type: 'RESULT', ...(await analyze(msg)) };
    case 'GET_HISTORY':
      return { type: 'HISTORY', analyses: await listAnalyses(msg.url) };
    case 'LOAD_ANALYSIS': {
      const rows = await getCombinedResults(msg.analysisId);
      return rows ? { type: 'ANALYSIS_LOADED', rows, scores: computeScores(rows) } : undefined;
    }
    case 'SET_OVERRIDE':
      await setOverride(msg.url, msg.criterionId, { result: msg.result, comment: msg.comment });
      return { type: 'OVERRIDE_SET' };
    case 'CLEAR_OVERRIDE':
      await clearOverride(msg.url, msg.criterionId);
      return { type: 'OVERRIDE_CLEARED' };
    case 'REANALYZE_CRITERION':
      return { type: 'CRITERION_REANALYZED', ...(await reanalyzeCriterion(msg)) };
    case 'ADD_FEEDBACK': {
      // Replace a same-kind feedback: save the new one first, so a failed write loses nothing.
      const feedback = await recordFeedback(msg.feedback);
      if (msg.replaceId) await removeFeedback(msg.replaceId);
      return { type: 'FEEDBACK_SAVED', feedback };
    }
    case 'GET_FEEDBACKS':
      return { type: 'FEEDBACKS', feedbacks: await listFeedbacks() };
    case 'UPDATE_FEEDBACK': {
      const feedback = await updateFeedback(msg.id, { comment: msg.comment, kind: msg.kind });
      return feedback ? { type: 'FEEDBACK_SAVED', feedback } : undefined;
    }
    case 'DELETE_FEEDBACK':
      await removeFeedback(msg.id);
      return { type: 'FEEDBACK_DELETED', id: msg.id };
    case 'CLEAR_FEEDBACKS':
      await clearAllFeedbacks();
      return { type: 'FEEDBACKS_CLEARED' };
    case 'OPEN_OPTIONS':
      // openOptionsPage() is unavailable from the DevTools panel: the panel asks us.
      void browser.runtime.openOptionsPage().catch((e) => console.error('Opquast:', e));
      return undefined;
  }
}

/** Why the browser refused the engine access to `tabId`. Never throws: unknown → PERMISSION_DENIED. */
async function diagnoseAccess(tabId: number, hintUrl?: string): Promise<AccessFailure> {
  const tab = await browser.tabs.get(tabId).catch(() => undefined);
  const url = tab?.url || hintUrl;
  const incognito = !!tab?.incognito;
  const incognitoAllowed = incognito
    ? await browser.extension.isAllowedIncognitoAccess().catch(() => true)
    : true;
  // URL unknown (hidden without access, e.g. about:blank in Chrome): holding every site means the
  // refusal is not about permission.
  const origins = url ? (isAnalysableUrl(url) ? [originPattern(url)] : null) : ['<all_urls>'];
  const originGranted = origins
    ? await browser.permissions.contains({ origins }).catch(() => null)
    : null;
  return classifyAccessFailure({ url, incognito, incognitoAllowed, originGranted });
}

/** Wait until the tab holds the page to analyse (see isTabReady); after a while, go anyway. */
async function waitForTabReady(tabId: number, expectedUrl?: string): Promise<string> {
  const end = Date.now() + TAB_READY_TIMEOUT_MS;
  while (Date.now() < end) {
    const tab = await browser.tabs.get(tabId);
    if (isTabReady(tab, expectedUrl)) return tab.url ?? '';
    await new Promise((r) => setTimeout(r, TAB_READY_POLL_MS));
  }
  return (await browser.tabs.get(tabId)).url ?? '';
}

/**
 * Run the engine in the tab on the given criteria: list and re-fetch the page's resources, probe
 * the site root, inject the engine libs, run. `injected` is false when the engine could not run
 * (e.g. a strict page CSP blocked the injection): the rows are then empty.
 */
async function runEngine(
  tabId: number,
  url: string,
  criterionIds: string[],
): Promise<{ rows: EngineRow[]; injected: boolean; resourceCount: number }> {
  const [rules, rulesets] = await Promise.all([
    loadJSON<Rules>('engine/rules.json'),
    loadJSON<Rulesets>('engine/rulesets.json'),
  ]);

  const scan = await browser.scripting.executeScript({ target: { tabId }, func: scanDomResources });
  const items = scan[0]?.result ?? [];
  const [fetched, main] = await Promise.all([
    refetchResources(items, url),
    fetchMainDocument(url), // its headers, for the CSP / charset / server rules
  ]);
  // The page first, as in the HAR the engine was written for.
  const resources = [...(main ? [main] : []), ...toResources(items, fetched)];
  const responses = fetched.responses;
  if (/^https?:/i.test(url)) {
    // robots.txt / sitemap.xml / 404 / www variant, read by the overlay's oqs-v5 rules. On failure
    // those rules answer "i" (undetermined) rather than a wrong verdict.
    Object.assign(responses, await probeRoot(new URL(url).origin).catch(() => ({})));
  }

  // ENGINE_FILES are generated into public/ at build time, so WXT cannot type them as public paths.
  await browser.scripting.executeScript({ target: { tabId }, files: [...ENGINE_FILES] as any });
  const injection = await browser.scripting.executeScript({
    target: { tabId },
    func: runEngineInPage,
    args: [
      {
        rules,
        rulesets: subsetRulesets(rulesets, criterionIds),
        resources,
        responses,
        events: 'inline',
      },
    ],
  });
  const engine = injection[0]?.result as EngineResult | undefined;
  const injected = Array.isArray(engine?.results);
  return {
    rows: injected ? (engine!.results as EngineRow[]) : [],
    injected,
    resourceCount: resources.length,
  };
}

/**
 * Analyse every enabled checklist in a single pass: one engine run over the union of their
 * criteria, then rows and scores per checklist. Each is stored, so the scores breakdown covers them
 * all; the active one (`slug`) is returned for the Results table.
 */
async function analyze(req: Extract<PanelRequest, { type: 'ANALYZE' }>) {
  const { tabId, slug, lang } = req;
  // The panel may fire while the page is still loading (DevTools opened on a fresh tab, autorun).
  const url = await waitForTabReady(tabId, req.url);

  const checklists = new Map<string, ChecklistFile>();
  for (const s of new Set([slug, ...(req.slugs ?? [])])) {
    try {
      checklists.set(s, await loadJSON<ChecklistFile>(`checklists/${lang}/${s}.json`));
    } catch (e) {
      // A checklist that doesn't ship this language (or is missing) is skipped, not fatal.
      if (s === slug) throw e;
      console.warn(`skipping checklist ${s} (${lang}): ${String(e)}`);
    }
  }
  const criterionIds = [...new Set([...checklists.values()].flatMap((c) => Object.keys(c)))];

  const engine = await runEngine(tabId, url, criterionIds);

  let activeRows: ResultRow[] = [];
  let analysisId = '';
  for (const p of projectChecklists(engine.rows, checklists, RECOVERED)) {
    // An engine that could not run (strict CSP) says nothing about the page: shown, never stored.
    const id = engine.injected
      ? await storeAnalysis(url, p.slug, lang, p.rows, p.scores, {
          resourceCount: engine.resourceCount,
        })
      : '';
    if (p.slug === slug) {
      activeRows = p.rows;
      analysisId = id;
    }
  }

  const rows = await mergeWithOverrides(url, activeRows);
  return {
    rows,
    scores: computeScores(rows),
    url,
    analysisId,
    engineInjected: engine.injected,
    // The engine that just ran: the same stamp storeAnalysis() persisted, so the panel and the
    // record can never disagree about what produced these rows.
    versions: currentVersions(),
  };
}

/**
 * Re-test a single criterion: re-run the engine on it alone, refresh its automatic result in the
 * stored analysis, clear any user override, and return the fresh row + scores.
 */
async function reanalyzeCriterion(req: Extract<PanelRequest, { type: 'REANALYZE_CRITERION' }>) {
  const { tabId, slug, lang, criterionId, analysisId } = req;
  const url = await waitForTabReady(tabId, req.url);

  const checklist = await loadJSON<ChecklistFile>(`checklists/${lang}/${slug}.json`);
  const criterion = checklist[criterionId];
  if (!criterion) throw new Error(`unknown criterion ${criterionId}`);

  // No row back: the panel keeps the row it shows (an ERROR would replace the whole table).
  const unchanged = { criterionId, row: null, scores: null as Scores | null };
  const engine = await runEngine(tabId, url, [criterionId]);
  // Without the engine the criterion would come back as a manual "nt" row: keep what is stored.
  if (!engine.injected) {
    console.warn(`Opquast: engine blocked, ${criterionId} not re-tested`);
    return unchanged;
  }
  const freshRow = buildResults(engine.rows, { [criterionId]: criterion }, RECOVERED)[0];
  if (!freshRow) return unchanged;

  const scores = await updateAnalysisCriterion(analysisId, freshRow);
  if (!scores) return unchanged; // analysis or row gone: leave the user's change alone too
  await clearOverride(url, criterionId);
  return { criterionId, row: { ...freshRow, userModified: false }, scores };
}

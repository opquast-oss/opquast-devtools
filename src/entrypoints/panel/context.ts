// Shared panel context: cached DOM handles (`els`), mutable UI `state`, the background `port`, and
// the small status constants. The single foundation every panel view/mutation module imports.

import type { ChecklistInfo } from '@/lib/checklists';
import type { Lang } from '@/lib/ui-strings';
import type { Scores, Status } from '@/lib/types';
import type { AnalysisSummary, CombinedResultRow, Feedback } from '@/lib/result-store';
import type { AppFeedback } from '@/lib/app-feedback';
import type { Revision, VersionStamp } from '@/lib/versions';

export function must<T extends Element>(el: T | null, what: string): T {
  if (!el) throw new Error(`panel: missing element ${what} (panel.html changed?)`);
  return el;
}
const $ = <T extends HTMLElement = HTMLElement>(id: string): T =>
  must<HTMLElement>(document.getElementById(id), `#${id}`) as T;

export const els = {
  // Toolbar elements
  checklist: $<HTMLSelectElement>('checklist'),
  lang: $<HTMLSelectElement>('lang'),
  search: $<HTMLInputElement>('search'),
  exportCsv: $<HTMLButtonElement>('export-csv'),
  analysisInfo: $('analysis-info'),
  relaunch: $<HTMLButtonElement>('relaunch'),
  settingsBtn: $<HTMLButtonElement>('settings-btn'),
  // Display dropdown
  displayToggle: $<HTMLButtonElement>('display-toggle'),
  displayMenu: $('display-menu'),
  showThemas: $<HTMLInputElement>('show-themas'),
  showTags: $<HTMLInputElement>('show-tags'),
  showC: $<HTMLInputElement>('show-c'),
  showNc: $<HTMLInputElement>('show-nc'),
  showI: $<HTMLInputElement>('show-i'),
  showNa: $<HTMLInputElement>('show-na'),
  showNt: $<HTMLInputElement>('show-nt'),
  // Loading overlay
  loadingOverlay: $('loading-overlay'),
  // Screen-reader announcements (analysis finished / failed)
  srStatus: $('sr-status'),
  // Tab elements
  tabScores: $<HTMLButtonElement>('tab-scores'),
  tabResults: $<HTMLButtonElement>('tab-results'),
  tabFeedbacks: $<HTMLButtonElement>('tab-feedbacks'),
  tabAbout: $<HTMLButtonElement>('tab-about'),
  panelScores: $('panel-scores'),
  panelResults: $('panel-results'),
  panelFeedbacks: $('panel-feedbacks'),
  panelAbout: $('panel-about'),
  engineWarning: $('engine-warning'),
  // Feedbacks view — unified table + bulk actions
  fbTable: $<HTMLTableElement>('feedbacks-table'),
  fbTbody: $('feedbacks-tbody'),
  fbEmpty: $('feedbacks-empty'),
  fbNotice: $('feedbacks-notice'),
  fbSelectAll: $<HTMLInputElement>('feedbacks-select-all'),
  fbSelection: $('feedbacks-selection'),
  fbTransmit: $<HTMLButtonElement>('feedbacks-transmit'),
  fbExport: $<HTMLButtonElement>('feedbacks-export'),
  fbDelete: $<HTMLButtonElement>('feedbacks-delete'),
  // App feedback form elements are dynamically rendered in about-view.ts when participateFeedback is enabled.
  // They are accessed via document.getElementById() at runtime, not cached here.
  // Scores view elements
  globalScore: $('global-score'),
  scoreDetails: $('score-details'),
  chooseChecklists: $('choose-checklists'),
  scoreBreakdown: $('score-breakdown'),
  // Results table
  body: $('results-body'),
  thead: must(
    document.querySelector('#results-table thead'),
    '#results-table thead',
  ) as HTMLElement,
  // Modal elements
  modalBackdrop: $('modal-backdrop'),
  detailModal: $('detail-modal'),
  detailContent: $('detail-content'),
  prevResult: $<HTMLButtonElement>('prev-result'),
  nextResult: $<HTMLButtonElement>('next-result'),
  closeModal: $<HTMLButtonElement>('close-modal'),
};

export const STATUSES = ['c', 'nc', 'i', 'na', 'nt'] as const;

// Status icons for the table
export const STATUS_ICONS: Record<Status, string> = {
  c: '✓', // ✓
  nc: '✗', // ✗
  i: '!', // ! (like Opquast Desktop)
  na: '⊘', // ⊘ (circle with slash)
  nt: '?',
};

// Clickable status change icons (shown on hover)
export const CHANGE_STATUSES: Status[] = ['c', 'nc', 'i', 'na'];

// Resilient background connection. In MV3 the background service worker is torn down after ~30s
// idle, which disconnects the port; a raw long-lived port would then silently drop every send and
// the panel would appear frozen. This wrapper reconnects lazily (on the next send, or right after a
// disconnect) and re-attaches the single message handler, so callers keep using `port.postMessage`
// / `port.onMessage.addListener` unchanged.
type RawPort = ReturnType<typeof browser.runtime.connect>;
type PortListener = Parameters<RawPort['onMessage']['addListener']>[0];

function createResilientPort(name: string) {
  let raw: RawPort | null = null;
  let handler: PortListener | null = null;

  function connect(): RawPort {
    const p = browser.runtime.connect({ name });
    if (handler) p.onMessage.addListener(handler);
    p.onDisconnect.addListener(() => {
      // Drop the dead port; the next postMessage (or onMessage registration) reconnects.
      if (raw === p) raw = null;
    });
    raw = p;
    return p;
  }

  function ensure(): RawPort {
    return raw ?? connect();
  }

  connect();

  return {
    postMessage(msg: unknown): void {
      try {
        ensure().postMessage(msg);
      } catch {
        // Port died between ensure() and send (SW just suspended): reconnect once and retry.
        connect().postMessage(msg);
      }
    },
    onMessage: {
      addListener(cb: PortListener): void {
        handler = cb; // single handler by design; re-attached on every reconnect
        ensure().onMessage.addListener(cb);
      },
    },
  };
}

export const port = createResilientPort('oqs-panel');

export const state = {
  rows: [] as CombinedResultRow[],
  scores: null as Scores | null,
  manifest: [] as ChecklistInfo[],
  lang: 'fr' as Lang,
  sortKey: 'ref' as 'ref' | 'result' | 'thema' | 'description',
  sortDir: 1 as 1 | -1,
  search: '',
  // Display filters
  showThemas: true,
  showTags: true,
  /** Result statuses hidden from the Results table. */
  hiddenStatuses: new Set<Status>(),
  selectedId: null as string | null,
  currentUrl: '' as string,
  analysisId: null as string | null,
  // New state for UI redesign
  activeTab: 'scores' as 'scores' | 'results' | 'feedbacks' | 'about',
  feedbacks: [] as Feedback[],
  // Unified feedbacks table (per-criterion journal + general app feedback)
  appFeedbacks: [] as AppFeedback[],
  fbSelected: new Set<string>(), // selected row keys `${origin}:${id}`
  fbExpanded: new Set<string>(), // expanded (detail visible) row keys
  fbEditing: null as string | null, // row key currently in inline-edit mode
  autoRun: true, // mirrors the "run on open" pref; drives the navigation handler
  participateFeedback: false, // opt-in: show Feedbacks tab and feedback features
  analysisInFlight: false, // concurrency guard for runAnalysis (cleared on RESULT / ERROR)
  /**
   * Sent with every page-scoped request and echoed by the background. Bumped on navigation and on
   * each new run, so a late answer about a page or run the panel has left is ignored.
   */
  requestId: 0,
  modalOpen: false,
  visibleRowIds: [] as string[],
  analysisTimestamp: null as number | null,
  analysisDuration: null as number | null,
  /** The engine that produced the displayed rows — not necessarily the one installed now. */
  versions: null as VersionStamp | null,
  /** Criteria within the displayed analysis re-run under a different engine. Usually empty. */
  revisions: [] as Revision[],
  // All analyses for the current URL (multi-checklist support)
  allAnalyses: [] as AnalysisSummary[],
};

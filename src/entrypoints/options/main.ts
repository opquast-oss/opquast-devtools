import {
  checklistName,
  ChecklistInfo,
  loadChecklistManifest,
  shippedSelection,
} from '@/lib/checklists';
import { populateChecklistDropdown } from '@/lib/checklist-ui';
import { getPrefs, onPrefsChanged, setPrefs, type Prefs } from '@/lib/prefs';
import { clearAnalyses, countAnalyses, listFeedbacks } from '@/lib/result-store';
import { getAppFeedbacks } from '@/lib/app-feedback';
import { localizeDocument, t, type Lang } from '@/lib/ui-strings';

const slug = document.getElementById('slug') as HTMLSelectElement;
const lang = document.getElementById('lang') as HTMLSelectElement;
const autoRun = document.getElementById('autoRun') as HTMLInputElement;
const showThemas = document.getElementById('showThemas') as HTMLInputElement;
const participateFeedback = document.getElementById('participateFeedback') as HTMLInputElement;
const checklists = document.getElementById('checklists') as HTMLFieldSetElement;
const saved = document.getElementById('saved'); // status indicator (optional)
const hostAccess = document.getElementById('hostAccess') as HTMLParagraphElement;
const grantHosts = document.getElementById('grantHosts') as HTMLButtonElement;
const historyCount = document.getElementById('historyCount') as HTMLParagraphElement;
const clearHistory = document.getElementById('clearHistory') as HTMLButtonElement;
const historyCleared = document.getElementById('historyCleared') as HTMLSpanElement;
const participateKept = document.getElementById('participateKept') as HTMLParagraphElement;

// The engine needs the <all_urls> host permission. Firefox lets the user decline or revoke it
// (about:addons → Permissions) and Chrome lets them restrict it (Site access): this is where the
// panel's "Permission needed" message sends them to get it back.
const ALL_SITES = { origins: ['<all_urls>'] };

const SAVED_FEEDBACK_MS = 1500;
const ERROR_FEEDBACK_MS = 6000;

let fullManifest: ChecklistInfo[] = [];
let statusTimer: ReturnType<typeof setTimeout> | undefined;
// Nothing is saved before init() has filled the form: an early change would save it empty.
let ready = false;

const uiLang = (): Lang => (lang.value === 'en' ? 'en' : 'fr');

/** Put the whole page, checklist names included, in the language currently selected. */
function localize(): void {
  localizeDocument(uiLang());
  document.title = t(uiLang(), 'optTitle');
  renderChecklistOptions(enabledSlugs());
  populateChecklistDropdown(slug, fullManifest, enabledSlugs(), lang.value, {
    withLangs: true,
    defaultSlug: slug.value,
  });
  void renderHostAccess().catch(logError);
  void renderHistoryCount().catch(logError);
  void renderParticipateKept().catch(logError);
}

function logError(e: unknown) {
  console.error('Opquast:', e);
}

/** Say something in the status line under the form, for `ms` (for good without it). */
function showStatus(text: string, ms?: number) {
  if (!saved) return;
  saved.textContent = text;
  clearTimeout(statusTimer);
  if (ms !== undefined) statusTimer = setTimeout(() => (saved.textContent = ''), ms);
}

/** Read the slugs whose referential checkbox is currently ticked. */
function enabledSlugs(): string[] {
  return [...checklists.querySelectorAll<HTMLInputElement>('input[type=checkbox]')]
    .filter((cb) => cb.checked)
    .map((cb) => cb.value);
}

/** Build one checkbox per referential; ticked when its slug is in `enabled`. */
function renderChecklistOptions(enabled: string[]): void {
  const set = new Set(enabled);
  checklists.replaceChildren(
    checklists.querySelector('legend')!,
    ...fullManifest.map((c) => {
      const label = document.createElement('label');
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.value = c.slug;
      cb.checked = set.has(c.slug);
      label.append(
        cb,
        document.createTextNode(` ${checklistName(fullManifest, c.slug, lang.value)}`),
      );
      return label;
    }),
  );
}

async function renderHostAccess(): Promise<void> {
  const granted = await browser.permissions.contains(ALL_SITES);
  hostAccess.className = granted ? '' : 'missing';
  hostAccess.textContent = t(uiLang(), granted ? 'optHostGranted' : 'optHostMissing');
  grantHosts.hidden = granted;
}

grantHosts.addEventListener('click', () => {
  // request() must be the first thing the click does: an await before it loses the user gesture.
  browser.permissions
    .request(ALL_SITES)
    .catch((e) => console.error('Opquast: permission request failed', e))
    .finally(() => void renderHostAccess().catch(logError));
});
browser.permissions.onAdded.addListener(() => void renderHostAccess().catch(logError));
browser.permissions.onRemoved.addListener(() => void renderHostAccess().catch(logError));

// The options page shares the extension's origin, hence the background's IndexedDB: it reads and
// clears the analysis history directly.
async function renderHistoryCount(): Promise<void> {
  const n = await countAnalyses();
  historyCount.textContent = t(uiLang(), 'optHistoryCount').replace('{n}', String(n));
  clearHistory.disabled = n === 0;
}

clearHistory.addEventListener('click', async () => {
  // A regular tab, unlike the DevTools panel: the native confirm dialog is reliable here.
  if (!window.confirm(t(uiLang(), 'optClearHistoryConfirm'))) return;
  let message: string;
  try {
    await clearAnalyses();
    message = `✓ ${t(uiLang(), 'optHistoryCleared')}`;
  } catch (e) {
    logError(e);
    message = `✗ ${t(uiLang(), 'optSaveFailed')}`;
  }
  await renderHistoryCount().catch(logError);
  historyCleared.textContent = message;
  setTimeout(() => (historyCleared.textContent = ''), ERROR_FEEDBACK_MS);
});

/**
 * Participation off with feedbacks still stored: say that they are kept, and where. Without it, a
 * user who just turned participation off would wonder why the panel still shows a Feedbacks tab.
 */
async function renderParticipateKept(): Promise<void> {
  if (participateFeedback.checked) {
    participateKept.hidden = true;
    return;
  }
  const [journal, app] = await Promise.all([listFeedbacks(), getAppFeedbacks()]);
  const n = journal.length + app.length;
  participateKept.hidden = n === 0;
  participateKept.textContent = n
    ? t(uiLang(), 'optParticipateOffKept').replace('{n}', String(n))
    : '';
}

async function init() {
  const [manifest, stored] = await Promise.all([loadChecklistManifest(), getPrefs()]);
  fullManifest = manifest;
  const prefs = { ...stored, ...shippedSelection(manifest, stored.enabledChecklists, stored.slug) };
  lang.value = prefs.lang;
  localizeDocument(uiLang());
  void renderHostAccess().catch(logError);
  void renderHistoryCount().catch(logError);
  renderChecklistOptions(prefs.enabledChecklists);
  populateChecklistDropdown(slug, fullManifest, prefs.enabledChecklists, lang.value, {
    withLangs: true,
    defaultSlug: prefs.slug,
  });
  slug.value = prefs.slug;
  autoRun.checked = prefs.autoRun;
  showThemas.checked = prefs.showThemas;
  participateFeedback.checked = prefs.participateFeedback;
  document.title = t(uiLang(), 'optTitle');
  void renderParticipateKept().catch(logError);
  ready = true;
}

/**
 * Save only what this page changed: the panel also writes the checklist and the language, and a
 * whole-form save would put back this page's older values.
 */
async function save(changes: Partial<Prefs>) {
  if (!ready) return;
  try {
    await setPrefs(changes);
  } catch (e) {
    logError(e);
    showStatus(`✗ ${t(uiLang(), 'optSaveFailed')}`, ERROR_FEEDBACK_MS);
    return;
  }
  showStatus(`✓ ${t(uiLang(), 'saved')}`, SAVED_FEEDBACK_MS);
}

function onChecklistsChange(e: Event) {
  const enabled = enabledSlugs();
  if (!ready) return;
  if (enabled.length === 0) {
    // Keep at least one referential: revert the box that was just unticked.
    const target = e.target as HTMLInputElement;
    target.checked = true;
    showStatus(t(uiLang(), 'optKeepOneChecklist'), ERROR_FEEDBACK_MS);
    return;
  }
  populateChecklistDropdown(slug, fullManifest, enabled, lang.value, {
    withLangs: true,
    defaultSlug: slug.value,
  });
  // The default checklist may have moved if its referential was just unticked.
  void save({ enabledChecklists: enabled, slug: slug.value });
}

slug.addEventListener('change', () => void save({ slug: slug.value }));
lang.addEventListener('change', () => void save({ lang: lang.value }));
autoRun.addEventListener('change', () => void save({ autoRun: autoRun.checked }));
showThemas.addEventListener('change', () => void save({ showThemas: showThemas.checked }));
participateFeedback.addEventListener('change', () => {
  void save({ participateFeedback: participateFeedback.checked });
  void renderParticipateKept().catch(logError);
});
lang.addEventListener('change', localize);

// A checklist or language picked in the panel meanwhile: show it here too.
onPrefsChanged((p) => {
  if (!ready) return;
  if (p.lang !== lang.value) {
    lang.value = p.lang;
    localize();
  }
  if ([...slug.options].some((o) => o.value === p.slug)) slug.value = p.slug;
});
checklists.addEventListener('change', onChecklistsChange);
init().catch((e) => {
  // Nothing is saved (ready stays false): say why the form does not answer.
  logError(e);
  showStatus(`✗ ${t(uiLang(), 'optLoadFailed')}`);
});

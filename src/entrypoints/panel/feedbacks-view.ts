// Feedbacks tab — a single unified table over two feedback sources:
//   • the per-criterion review journal (confirm / refute / clarify / change), stored in IndexedDB
//     via the background port;
//   • general app feedback (bug / idea / other) about the extension itself, in storage.local.
// Each row shows Origine · Type · Date with expand (detail), inline edit and delete; a header
// checkbox + per-row checkboxes drive bulk delete / export / transmit. "Donner mon avis" adds a new
// app feedback. Nothing is transmitted until the user clicks Transmit (opens their mail client).

import { els, state, port, STATUS_ICONS } from './context';
import { t, feedbackKindLabel, statusLabel, type StringKey } from '@/lib/ui-strings';
import { esc } from './html';
import type { CombinedResultRow, FeedbackKind } from '@/lib/result-store';
import type { Status } from '@/lib/types';
import { buildFeedbackCsv } from '@/lib/csv';
import { downloadText } from './download';
import { updateTabLabels } from './scores-view';
import { checklistName } from '@/lib/checklists';
import {
  currentVersions,
  formatVersions,
  sameEngine,
  UNKNOWN_VERSIONS,
  type VersionStamp,
} from '@/lib/versions';
import {
  getAppFeedbacks,
  updateAppFeedback,
  deleteAppFeedback,
  type AppFeedbackCategory,
} from '@/lib/app-feedback';

// Where "Transmit" addresses its e-mail.
const FEEDBACK_EMAIL = 'contact@opquast.com';

const CATEGORY_KEY: Record<AppFeedbackCategory, StringKey> = {
  bug: 'appFbCatBug',
  idea: 'appFbCatIdea',
  other: 'appFbCatOther',
};

type Origin = 'result' | 'app';

interface FbRow {
  key: string; // `${origin}:${id}`
  origin: Origin;
  id: string;
  typeKey: string;
  typeLabel: string;
  createdAt: number;
  // detail
  ref?: string;
  slug?: string;
  status?: Status;
  description?: string;
  url?: string;
  body: string; // comment (result) or message (app)
  // Only on result feedbacks: what produced the verdict being commented on.
  versions?: VersionStamp;
  analysisId?: string;
}

// ---- Per-criterion send (used by the detail modal) -------------------------

/** Record a feedback on `row`; false when nothing was sent (no page, duplicate, replace refused). */
export async function sendFeedback(
  row: CombinedResultRow,
  kind: FeedbackKind,
  comment: string,
): Promise<boolean> {
  if (!state.currentUrl) return false;

  // Duplicate guard: one feedback of each kind per criterion per page.
  const existing = state.feedbacks.find(
    (f) => f.url === state.currentUrl && f.criterionId === row.id && f.kind === kind,
  );
  if (existing) {
    if ((existing.comment ?? '') === (comment ?? '')) {
      toast(t(state.lang, 'fbAlready'));
      return false;
    }
    if (!(await confirmDialog(t(state.lang, 'fbReplaceAsk')))) return false;
  }

  const c = (row.criterion ?? {}) as { name?: string; description?: string };
  port.postMessage({
    type: 'ADD_FEEDBACK',
    replaceId: existing?.id,
    feedback: {
      url: state.currentUrl,
      criterionId: row.id,
      criterionRef: String(c.name ?? row.id),
      description: String(c.description ?? ''),
      slug: els.checklist.value,
      obtainedResult: row.result,
      kind,
      comment,
      // From the DISPLAYED analysis, not the current build: a result restored from history may
      // have been produced by an earlier engine, which is the case this traceability exists for.
      analysisId: state.analysisId ?? '',
      analysisTimestamp: state.analysisTimestamp ?? 0,
      versions: state.versions ?? UNKNOWN_VERSIONS,
    },
  });
  toast(t(state.lang, existing ? 'fbReplaced' : 'fbSaved'));
  return true;
}

export function toast(message: string) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = message;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 1600);
}

// ---- Setup & localization --------------------------------------------------

export function setupFeedbacks() {
  // Bulk actions
  els.fbSelectAll.addEventListener('change', () => toggleSelectAll(els.fbSelectAll.checked));
  els.fbDelete.addEventListener('click', () => void bulkDelete());
  els.fbTransmit.addEventListener('click', () => transmitSelected());
  els.fbExport.addEventListener('click', () => exportSelected());
}

/** Load app feedbacks from storage.local into state, then re-render (call on tab open / boot). */
export async function loadAppFeedbacks() {
  state.appFeedbacks = await getAppFeedbacks();
  renderFeedbacks();
  updateTabLabels(); // the count, and whether the tab shows at all
}

// ---- Unified table ---------------------------------------------------------

function buildRows(): FbRow[] {
  const L = state.lang;
  const rows: FbRow[] = [];
  for (const f of state.feedbacks) {
    rows.push({
      key: `result:${f.id}`,
      origin: 'result',
      id: f.id,
      typeKey: f.kind,
      typeLabel: feedbackKindLabel(L, f.kind),
      createdAt: f.createdAt,
      ref: f.criterionRef,
      slug: f.slug,
      status: f.obtainedResult as Status,
      description: f.description,
      url: f.url,
      body: f.comment ?? '',
      versions: f.versions,
      analysisId: f.analysisId,
    });
  }
  for (const a of state.appFeedbacks) {
    rows.push({
      key: `app:${a.id}`,
      origin: 'app',
      id: a.id,
      typeKey: a.category,
      typeLabel: t(L, CATEGORY_KEY[a.category]),
      createdAt: a.createdAt,
      body: a.message,
    });
  }
  rows.sort((x, y) => y.createdAt - x.createdAt);
  return rows;
}

export function renderFeedbacks() {
  const rows = buildRows();
  const keys = new Set(rows.map((r) => r.key));
  for (const k of [...state.fbSelected]) if (!keys.has(k)) state.fbSelected.delete(k);
  for (const k of [...state.fbExpanded]) if (!keys.has(k)) state.fbExpanded.delete(k);
  if (state.fbEditing && !keys.has(state.fbEditing)) state.fbEditing = null;

  // Participation off but feedbacks kept: say why the tab is still here and what can be done.
  els.fbNotice.hidden = state.participateFeedback;
  els.fbNotice.textContent = state.participateFeedback ? '' : t(state.lang, 'fbParticipationOff');

  els.fbTable.hidden = rows.length === 0;
  els.fbEmpty.hidden = rows.length > 0;
  els.fbEmpty.textContent = rows.length ? '' : t(state.lang, 'fbNone');

  const frag = document.createDocumentFragment();
  for (const r of rows) {
    frag.appendChild(mainRow(r));
    if (state.fbEditing === r.key) frag.appendChild(editRow(r));
    else if (state.fbExpanded.has(r.key)) frag.appendChild(detailRow(r));
  }
  els.fbTbody.replaceChildren(frag);
  updateBulkState();
}

function mainRow(r: FbRow): HTMLTableRowElement {
  const L = state.lang;
  const tr = document.createElement('tr');
  tr.className = `fb-row origin-${r.origin} type-${r.typeKey}`;
  tr.dataset.key = r.key;

  // checkbox
  const tdCheck = document.createElement('td');
  tdCheck.className = 'fb-col-check';
  const cb = document.createElement('input');
  cb.type = 'checkbox';
  cb.checked = state.fbSelected.has(r.key);
  cb.setAttribute('aria-label', t(L, 'fbSelectRow'));
  cb.addEventListener('change', () => {
    if (cb.checked) state.fbSelected.add(r.key);
    else state.fbSelected.delete(r.key);
    updateBulkState();
  });
  tdCheck.appendChild(cb);

  // origin — for a result feedback, qualify it inline with the checklist name + rule number
  const tdOrigin = document.createElement('td');
  if (r.origin === 'result') {
    const name = r.slug ? checklistName(state.manifest, r.slug, L) : '';
    tdOrigin.textContent = [
      t(L, 'fbOriginResult'),
      name,
      r.ref ? t(L, 'fbRule').replace('{n}', r.ref) : '',
    ]
      .filter(Boolean)
      .join(' · ');
  } else {
    tdOrigin.textContent = t(L, 'fbOriginApp');
  }

  // type badge
  const tdType = document.createElement('td');
  const badge = document.createElement('span');
  badge.className = `fb-type-badge type-${r.typeKey}`;
  badge.textContent = r.typeLabel;
  tdType.appendChild(badge);

  // date
  const tdDate = document.createElement('td');
  tdDate.className = 'fb-col-date';
  tdDate.textContent = formatDate(r.createdAt);

  // actions
  const tdActions = document.createElement('td');
  tdActions.className = 'fb-col-actions';
  const expanded = state.fbExpanded.has(r.key);
  const toggle = iconBtn(expanded ? '▲' : '▼', t(L, expanded ? 'fbFold' : 'fbUnfold'), () => {
    if (state.fbExpanded.has(r.key)) state.fbExpanded.delete(r.key);
    else state.fbExpanded.add(r.key);
    state.fbEditing = null;
    renderFeedbacks();
  });
  toggle.setAttribute('aria-expanded', String(expanded));
  tdActions.append(
    toggle,
    iconBtn('✎', t(L, 'fbEdit'), () => {
      state.fbEditing = state.fbEditing === r.key ? null : r.key;
      state.fbExpanded.delete(r.key);
      renderFeedbacks();
    }),
    iconBtn('×', t(L, 'fbDelete'), () => void deleteRow(r)),
  );

  tr.append(tdCheck, tdOrigin, tdType, tdDate, tdActions);
  return tr;
}

function detailRow(r: FbRow): HTMLTableRowElement {
  const L = state.lang;
  const tr = document.createElement('tr');
  tr.className = 'fb-detail';
  const td = document.createElement('td');
  td.colSpan = 5;

  if (r.origin === 'result') {
    const head = document.createElement('div');
    head.className = 'fb-detail-head';
    head.innerHTML =
      `<span class="fb-ref">${esc(r.ref ?? '')}</span>` +
      (r.status
        ? `<span class="status-icon ${esc(r.status)}" title="${esc(statusLabel(L, r.status))}">${STATUS_ICONS[r.status] ?? '?'}</span>`
        : '') +
      `<span class="fb-desc">${esc(r.description ?? '')}</span>`;
    td.appendChild(head);
  }
  if (r.body) {
    const p = document.createElement('p');
    p.className = 'fb-body';
    p.textContent = r.body;
    td.appendChild(p);
  }
  if (r.url) {
    const a = document.createElement('a');
    a.className = 'fb-url';
    a.href = r.url;
    a.textContent = r.url;
    a.target = '_blank';
    a.rel = 'noreferrer';
    td.appendChild(a);
  }
  tr.appendChild(td);
  return tr;
}

function editRow(r: FbRow): HTMLTableRowElement {
  const L = state.lang;
  const tr = document.createElement('tr');
  tr.className = 'fb-edit';
  const td = document.createElement('td');
  td.colSpan = 5;
  const form = document.createElement('form');
  form.className = 'fb-edit-form';

  let getChanges: () => { done: boolean };

  if (r.origin === 'app') {
    const select = document.createElement('select');
    for (const cat of ['bug', 'idea', 'other'] as AppFeedbackCategory[]) {
      const o = document.createElement('option');
      o.value = cat;
      o.textContent = t(L, CATEGORY_KEY[cat]);
      if (cat === r.typeKey) o.selected = true;
      select.appendChild(o);
    }
    const ta = textarea(r.body);
    form.append(field(t(L, 'appFbCategory'), select), field(t(L, 'appFbMessage'), ta));
    getChanges = () => {
      const message = ta.value.trim();
      if (!message) return { done: false };
      void updateAppFeedback(r.id, {
        category: select.value as AppFeedbackCategory,
        message,
      }).then((list) => {
        state.appFeedbacks = list;
        state.fbEditing = null;
        renderFeedbacks();
      });
      return { done: true };
    };
  } else {
    const ta = textarea(r.body);
    form.append(field(t(L, 'appFbMessage'), ta));
    getChanges = () => {
      port.postMessage({ type: 'UPDATE_FEEDBACK', id: r.id, comment: ta.value.trim() });
      state.fbEditing = null;
      // FEEDBACK_SAVED → requestFeedbacks → renderFeedbacks refreshes the row
      return { done: true };
    };
  }

  const actions = document.createElement('div');
  actions.className = 'fb-edit-actions';
  const save = document.createElement('button');
  save.type = 'submit';
  save.className = 'export-btn';
  save.textContent = t(L, 'appFbSave');
  const cancel = document.createElement('button');
  cancel.type = 'button';
  cancel.className = 'icon-btn';
  cancel.textContent = t(L, 'appFbCancel');
  cancel.addEventListener('click', () => {
    state.fbEditing = null;
    renderFeedbacks();
  });
  actions.append(save, cancel);
  form.appendChild(actions);
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    getChanges();
  });

  td.appendChild(form);
  tr.appendChild(td);
  return tr;
}

async function deleteRow(r: FbRow) {
  if (!(await confirmDialog(t(state.lang, 'fbDeleteConfirm')))) return;
  if (r.origin === 'app') {
    state.appFeedbacks = await deleteAppFeedback(r.id);
    state.fbSelected.delete(r.key);
    renderFeedbacks();
    updateTabLabels();
  } else {
    state.fbSelected.delete(r.key);
    port.postMessage({ type: 'DELETE_FEEDBACK', id: r.id }); // FEEDBACK_DELETED → refresh
  }
}

// ---- Bulk actions ----------------------------------------------------------

function toggleSelectAll(on: boolean) {
  state.fbSelected.clear();
  if (on) for (const r of buildRows()) state.fbSelected.add(r.key);
  renderFeedbacks();
}

function updateBulkState() {
  const total = state.feedbacks.length + state.appFeedbacks.length;
  const n = state.fbSelected.size;
  els.fbTransmit.disabled = n === 0;
  els.fbExport.disabled = n === 0;
  els.fbDelete.disabled = n === 0;
  els.fbSelection.textContent = n ? t(state.lang, 'fbSelected').replace('{n}', String(n)) : '';
  els.fbSelectAll.checked = total > 0 && n === total;
  els.fbSelectAll.indeterminate = n > 0 && n < total;
}

function selectedRows(): FbRow[] {
  return buildRows().filter((r) => state.fbSelected.has(r.key));
}

async function bulkDelete() {
  const rows = selectedRows();
  if (!rows.length || !(await confirmDialog(t(state.lang, 'fbBulkDeleteConfirm')))) return;
  // App feedbacks: remove locally in one pass. Result feedbacks: ask the background.
  const appIds = new Set(rows.filter((r) => r.origin === 'app').map((r) => r.id));
  if (appIds.size) {
    try {
      for (const id of appIds) await deleteAppFeedback(id);
    } finally {
      state.appFeedbacks = await getAppFeedbacks(); // what is really left, even after a failure
    }
  }
  for (const r of rows.filter((r) => r.origin === 'result')) {
    port.postMessage({ type: 'DELETE_FEEDBACK', id: r.id });
  }
  state.fbSelected.clear();
  renderFeedbacks();
  updateTabLabels();
}

/**
 * Open a prefilled message in the user's mail client.
 *
 * The extension never sends anything: it hands the client a draft, which the user reads, edits and
 * sends — or does not. The draft still carries no more than a report needs: no user agent, and page
 * addresses without their query string or fragment, where tokens and personal data tend to sit.
 */
async function transmitSelected() {
  const rows = selectedRows();
  if (!rows.length) return;
  const L = state.lang;
  const subject = t(L, 'appFbEmailSubject');

  // One header rather than a stamp per line. It is a property of the environment the report is
  // written in, not of any single remark, and repeating it would make the message unreadable —
  // which invites skimming past exactly the part that makes a report actionable.
  const here = currentVersions();
  const header = [
    '— Opquast DevTools —',
    `${t(L, 'fbEmailHeaderExt')} : ${here.ext || '?'}`,
    `${t(L, 'fbEmailHeaderEngine')} : ${formatVersions(here, L)}`,
    `${t(L, 'fbEmailHeaderDate')} : ${formatDate(Date.now())}`,
    '———',
  ].join('\n');

  const body = rows
    .map((r) => {
      const origin = t(L, r.origin === 'result' ? 'fbOriginResult' : 'fbOriginApp');
      // The verdict was missing entirely: "[Résultats · Confirmé] 122" never said WHAT was
      // confirmed, which is a worse traceability hole than the engine version.
      const verdict = r.status ? ` · ${statusLabel(L, r.status)}` : '';
      const head =
        r.origin === 'result'
          ? `[${origin} · ${r.typeLabel}${verdict}] ${r.ref ?? ''} — ${r.description ?? ''}`
          : `[${origin} · ${r.typeLabel}]`;
      // Only when this row disagrees with the header — a selection can mix runs, and after an
      // update it can mix engines. Silent in the ordinary case, honest in the mixed one.
      const drift =
        r.origin === 'result' && !sameEngine(r.versions, here)
          ? `\n(${formatVersions(r.versions, L)})`
          : '';
      const url = r.url ? `\n${pageAddress(r.url)}` : '';
      return `${head}\n${r.body}\n(${formatDate(r.createdAt)})${drift}${url}`;
    })
    .join('\n\n');

  const href = `mailto:${FEEDBACK_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(`${header}\n\n${body}`)}`;
  // browser.tabs.create() works in Chrome DevTools panels but may fail silently in Firefox.
  // Fall back to window.open() which works in both, though Chrome prefers tabs.create().
  try {
    await browser.tabs.create({ url: href });
  } catch {
    window.open(href, '_blank');
  }
}

/**
 * Write the selected feedbacks to a spreadsheet.
 *
 * Not a duplicate of the email: `mailto:` is capped by mail clients well below anything a browser
 * imposes, so a large selection silently loses its tail. This is also the archival format — the
 * one you keep, sort and come back to — which is why the engine columns are repeated per line
 * rather than stated once in a preamble no spreadsheet can import.
 */
function exportSelected() {
  const rows = selectedRows();
  if (!rows.length) return;
  const L = state.lang;
  const csv = buildFeedbackCsv(
    rows.map((r) => ({
      origin: t(L, r.origin === 'result' ? 'fbOriginResult' : 'fbOriginApp'),
      typeLabel: r.typeLabel,
      createdAt: r.createdAt,
      slug: r.slug,
      ref: r.ref,
      description: r.description,
      status: r.status,
      body: r.body,
      url: r.url,
      versions: r.versions,
      analysisId: r.analysisId,
    })),
    L,
  );
  downloadText(`opquast-feedbacks-${new Date().toISOString().slice(0, 10)}.csv`, csv);
}

// ---- small helpers ---------------------------------------------------------

/**
 * In-panel confirmation. window.confirm() is unreliable inside a DevTools panel (the native dialog
 * is often suppressed), so we render our own modal and resolve a promise on the user's choice.
 */
function confirmDialog(message: string): Promise<boolean> {
  return new Promise((resolve) => {
    const backdrop = document.createElement('div');
    backdrop.className = 'confirm-backdrop';
    const box = document.createElement('div');
    box.className = 'confirm-box';
    const p = document.createElement('p');
    p.className = 'confirm-msg';
    p.textContent = message;
    const actions = document.createElement('div');
    actions.className = 'confirm-actions';
    const no = document.createElement('button');
    no.type = 'button';
    no.className = 'icon-btn';
    no.textContent = t(state.lang, 'confirmNo');
    const yes = document.createElement('button');
    yes.type = 'button';
    yes.className = 'export-btn';
    yes.textContent = t(state.lang, 'confirmYes');
    const close = (v: boolean) => {
      backdrop.remove();
      document.removeEventListener('keydown', onKey);
      resolve(v);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close(false);
    };
    no.addEventListener('click', () => close(false));
    yes.addEventListener('click', () => close(true));
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) close(false);
    });
    document.addEventListener('keydown', onKey);
    actions.append(no, yes);
    box.append(p, actions);
    backdrop.appendChild(box);
    document.body.appendChild(backdrop);
    yes.focus();
  });
}

function iconBtn(glyph: string, title: string, onClick: () => void): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'fb-action';
  b.title = title;
  b.setAttribute('aria-label', title); // the glyph alone names nothing
  const icon = document.createElement('span');
  icon.setAttribute('aria-hidden', 'true');
  icon.textContent = glyph;
  b.appendChild(icon);
  b.addEventListener('click', onClick);
  return b;
}

function field(labelText: string, control: HTMLElement): HTMLLabelElement {
  const label = document.createElement('label');
  label.className = 'app-feedback-field';
  const span = document.createElement('span');
  span.textContent = labelText;
  label.append(span, control);
  return label;
}

function textarea(value: string): HTMLTextAreaElement {
  const ta = document.createElement('textarea');
  ta.rows = 3;
  ta.value = value;
  return ta;
}

/** `url` without its query string and fragment (unchanged if it does not parse). */
export function pageAddress(url: string): string {
  try {
    const u = new URL(url);
    u.search = '';
    u.hash = '';
    return u.href;
  } catch {
    return url;
  }
}

function formatDate(ts: number): string {
  try {
    return new Date(ts).toLocaleString(state.lang === 'fr' ? 'fr-FR' : 'en-US');
  } catch {
    return String(ts);
  }
}

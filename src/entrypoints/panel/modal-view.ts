// Detail modal: open/close + keyboard navigation across the visible rows, the full criterion detail
// pane (metadata, result modifier, comment editor, occurrences, feedback affordances), and the
// per-occurrence rendering.

import { els, state, STATUSES, STATUS_ICONS } from './context';
import { t, statusLabel, type Lang } from '@/lib/ui-strings';
import { esc, decodeEntities, reconstructTag } from './html';
import type { Detail, Status } from '@/lib/types';
import { highlightElement, clearHighlight, inspect } from './inspect';
import { changeResult, saveComment, reanalyzeCriterion, resetToAutomatic } from './mutations';
import { sendFeedback } from './feedbacks-view';
import { visibleRows } from './table-view';
import { getTestDescriptionsForCriterion } from '@/lib/test-procedure';

export function setupModal() {
  els.closeModal.addEventListener('click', closeModal);
  els.modalBackdrop.addEventListener('click', closeModal);
  els.prevResult.addEventListener('click', navigatePrev);
  els.nextResult.addEventListener('click', navigateNext);

  // Keyboard navigation
  document.addEventListener('keydown', (e) => {
    if (!state.modalOpen) return;
    // A confirmation box open over the detail owns the keyboard (its Escape closes it alone).
    if (document.querySelector('.confirm-backdrop')) return;
    // In a text field or a select, the arrows move the caret or the choice, not the criterion.
    const inField = !!(e.target as HTMLElement | null)?.closest?.('textarea, input, select');

    if (e.key === 'Escape') {
      e.preventDefault();
      closeModal();
    } else if (e.key === 'Tab') {
      trapFocus(e);
    } else if (inField) {
      return;
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault();
      navigatePrev();
    } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault();
      navigateNext();
    }
  });
}

/** Keep Tab / Shift+Tab inside the open detail (aria-modal promises nothing else is reachable). */
function trapFocus(e: KeyboardEvent) {
  const focusable = [
    ...els.detailModal.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])',
    ),
  ].filter((el) => !el.closest('[hidden]'));
  if (!focusable.length) return;
  const first = focusable[0]!;
  const last = focusable[focusable.length - 1]!;
  const inside = els.detailModal.contains(document.activeElement);
  if (e.shiftKey && (document.activeElement === first || !inside)) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && (document.activeElement === last || !inside)) {
    e.preventDefault();
    first.focus();
  }
}

// Where the focus was when the detail opened: it goes back there on close.
let returnFocus: HTMLElement | null = null;

export function openModal(rowId: string) {
  if (!state.modalOpen) returnFocus = document.activeElement as HTMLElement | null;
  state.selectedId = rowId;
  state.modalOpen = true;

  // Update visible row IDs for navigation
  state.visibleRowIds = visibleRows().map((r) => r.id);

  els.modalBackdrop.hidden = false;
  els.detailModal.hidden = false;

  renderModalDetail();
  updateNavButtons();
  highlightSelectedRow();

  // Focus close button for accessibility
  els.closeModal.focus();
}

export function closeModal() {
  const wasOpen = state.modalOpen;
  state.modalOpen = false;
  els.modalBackdrop.hidden = true;
  els.detailModal.hidden = true;
  clearHighlight();
  if (!wasOpen) return;
  // Back to the row of the criterion last shown (navigation may have moved on), else where it was.
  const tr = [...els.body.querySelectorAll<HTMLElement>('tr[data-id]')].find(
    (r) => r.dataset.id === state.selectedId,
  );
  const row = tr?.querySelector<HTMLElement>('.row-open');
  (row ?? returnFocus)?.focus();
  returnFocus = null;
}

function navigatePrev() {
  const currentIndex = state.visibleRowIds.indexOf(state.selectedId ?? '');
  if (currentIndex > 0) {
    state.selectedId = state.visibleRowIds[currentIndex - 1] ?? null;
    renderModalDetail();
    updateNavButtons();
    highlightSelectedRow();
  }
}

function navigateNext() {
  const currentIndex = state.visibleRowIds.indexOf(state.selectedId ?? '');
  if (currentIndex < state.visibleRowIds.length - 1) {
    state.selectedId = state.visibleRowIds[currentIndex + 1] ?? null;
    renderModalDetail();
    updateNavButtons();
    highlightSelectedRow();
  }
}

function updateNavButtons() {
  const currentIndex = state.visibleRowIds.indexOf(state.selectedId ?? '');
  els.prevResult.disabled = currentIndex <= 0;
  els.nextResult.disabled = currentIndex >= state.visibleRowIds.length - 1;
}

function highlightSelectedRow() {
  els.body
    .querySelectorAll('tr')
    .forEach((tr) =>
      tr.classList.toggle('selected', (tr as HTMLElement).dataset.id === state.selectedId),
    );
}

export function renderModalDetail() {
  const row = state.rows.find((r) => r.id === state.selectedId);
  if (!row) return;

  const L = state.lang;
  const c = row.criterion ?? {};
  const frag = document.createElement('div');
  const url = ficheUrl(L, c.name);
  const rerun = state.revisions.find((r) => r.criterionId === row.id);

  // ---- 1. Header: number + rule (a link to the public page, with an external-link icon) ----
  const head = document.createElement('div');
  head.className = 'detail-header';
  const refText = c.name ?? row.id;
  const descText = c.description ?? '';

  if (url) {
    head.innerHTML = `
      <h2 id="detail-title">
        <a class="fiche-link" href="${esc(url)}" target="_blank" rel="noopener noreferrer">
          <span class="detail-ref">${esc(refText)}</span>
          <span class="detail-desc">${esc(descText)}</span>
          <span class="external-link-icon" aria-hidden="true">↗</span>
        </a>
      </h2>`;
  } else {
    head.innerHTML = `
      <h2 id="detail-title">
        <span class="detail-ref">${esc(refText)}</span>
        <span class="detail-desc">${esc(descText)}</span>
      </h2>`;
  }
  frag.appendChild(head);

  // ---- 2. Tags: Rubrique (thema) as first tag, then other tags with spacing ----
  const tagsSec = document.createElement('div');
  tagsSec.className = 'detail-tags';

  // Rubrique as first tag
  if (c.thema) {
    const themaTag = document.createElement('span');
    themaTag.className = 'tag tag-thema';
    themaTag.textContent = c.thema;
    tagsSec.appendChild(themaTag);
  }

  // Other tags
  if (c.tags && c.tags.length > 0) {
    for (const tag of c.tags) {
      const span = document.createElement('span');
      span.className = 'tag';
      span.textContent = tag;
      tagsSec.appendChild(span);
    }
  }

  if (tagsSec.children.length > 0) {
    frag.appendChild(tagsSec);
  }

  // ---- 3. Result ----
  const resultSec = document.createElement('section');
  resultSec.className = 'detail-result';

  // Result header line: "Result: [icon] [status label]"
  const resultHeader = document.createElement('div');
  resultHeader.className = 'result-header';

  const resultLabel = document.createElement('span');
  resultLabel.className = 'result-label';
  resultLabel.textContent = t(L, 'secResult');
  resultHeader.appendChild(resultLabel);

  const statusSpan = document.createElement('span');
  statusSpan.className = `status-icon ${row.result}`;
  statusSpan.textContent = STATUS_ICONS[row.result];
  resultHeader.appendChild(statusSpan);

  const statusText = document.createElement('span');
  statusText.className = `status-text ${row.result}`;
  statusText.textContent = statusLabel(L, row.result);
  resultHeader.appendChild(statusText);

  // Notes (forcedNt, userModified, rerun)
  if (row.forcedNt) {
    const note = document.createElement('em');
    note.className = 'detail-note';
    note.textContent = t(L, 'forcedNtNote');
    resultHeader.appendChild(note);
  }
  if (row.userModified) {
    const note = document.createElement('em');
    note.className = 'detail-note user-modified-label';
    note.textContent = t(L, 'userModified');
    resultHeader.appendChild(note);
  }
  if (rerun) {
    const note = document.createElement('em');
    note.className = 'detail-note rerun-label';
    note.textContent = t(L, 'criterionRerun').replace('{v}', rerun.versions.hash);
    resultHeader.appendChild(note);
  }

  resultSec.appendChild(resultHeader);

  // Result actions (dropdown, rerun, reset) on separate line
  const resultActions = document.createElement('div');
  resultActions.className = 'result-actions';

  const select = document.createElement('select');
  select.className = 'result-select';
  select.setAttribute('aria-label', t(L, 'changeResult'));
  for (const st of STATUSES) {
    const opt = document.createElement('option');
    opt.value = st;
    opt.textContent = statusLabel(L, st);
    if (st === row.result) opt.selected = true;
    select.appendChild(opt);
  }
  select.addEventListener('change', () => {
    changeResult(row.id, select.value as Status);
  });
  resultActions.appendChild(select);

  // Per-criterion re-run button
  if (row.auto && state.analysisId) {
    const rerunBtn = document.createElement('button');
    rerunBtn.type = 'button';
    rerunBtn.className = 'rerun-btn';
    rerunBtn.textContent = t(L, 'rerunCriterion');
    rerunBtn.addEventListener('click', () => {
      rerunBtn.disabled = true;
      rerunBtn.textContent = t(L, 'rerunning');
      reanalyzeCriterion(row.id);
    });
    resultActions.appendChild(rerunBtn);
  }

  // Any manual change can be undone here (result or comment, automated criterion or not).
  if (row.userModified) {
    if (row.originalResult) {
      const origSpan = document.createElement('span');
      origSpan.className = 'original-result';
      origSpan.innerHTML = `${esc(t(L, 'originalResult'))} <span class="badge ${esc(row.originalResult)}">${esc(statusLabel(L, row.originalResult))}</span>`;
      resultActions.appendChild(origSpan);
    }

    const resetBtn = document.createElement('button');
    resetBtn.type = 'button';
    resetBtn.className = 'reset-btn';
    resetBtn.textContent = t(L, 'resetToAuto');
    resetBtn.addEventListener('click', () => resetToAutomatic(row.id));
    resultActions.appendChild(resetBtn);
  }

  resultSec.appendChild(resultActions);
  frag.appendChild(resultSec);

  // ---- 4. Comment (Notes personnelles) ----
  const commentSec = document.createElement('section');
  commentSec.className = 'detail-comment';
  const commentH3 = document.createElement('h3');
  commentH3.textContent = t(L, 'secComment');
  commentSec.appendChild(commentH3);

  const commentDiv = document.createElement('div');
  commentDiv.className = 'comment-editor';

  const textarea = document.createElement('textarea');
  textarea.className = 'comment-textarea';
  textarea.placeholder = t(L, 'addComment');
  textarea.value = row.comment ?? '';
  textarea.rows = 3;
  commentDiv.appendChild(textarea);

  const saveBtn = document.createElement('button');
  saveBtn.type = 'button';
  saveBtn.className = 'save-comment-btn';
  saveBtn.textContent = t(L, 'saveComment');
  saveBtn.addEventListener('click', () => {
    saveComment(row.id, textarea.value);
  });
  commentDiv.appendChild(saveBtn);

  if (row.userModified && row.originalComment !== undefined) {
    const origComment = document.createElement('p');
    origComment.className = 'original-comment';
    origComment.textContent = t(L, 'originalValue').replace(
      '{v}',
      row.originalComment || t(L, 'empty'),
    );
    commentDiv.appendChild(origComment);
  }

  commentSec.appendChild(commentDiv);
  frag.appendChild(commentSec);

  // ---- 4.5 Test procedure (only if participateFeedback is enabled) ----
  if (state.participateFeedback) {
    const procSec = document.createElement('section');
    procSec.className = 'detail-procedure';

    const procH3 = document.createElement('h3');
    procH3.textContent = t(L, 'secProcedure');
    procSec.appendChild(procH3);

    const procContent = document.createElement('div');
    procContent.className = 'procedure-content';

    if (row.auto) {
      // Automated test - show procedure type and load test descriptions
      const procType = document.createElement('span');
      procType.className = 'procedure-type auto';
      procType.textContent = t(L, 'procAuto');
      procContent.appendChild(procType);

      // Load and display test descriptions asynchronously
      const descList = document.createElement('ul');
      descList.className = 'procedure-tests';
      procContent.appendChild(descList);

      // Async load test descriptions for this criterion
      getTestDescriptionsForCriterion(row.id, L)
        .then((tests) => {
          for (const test of tests) {
            const li = document.createElement('li');
            li.textContent = test.description || test.name;
            descList.appendChild(li);
          }
        })
        .catch((e) => console.error('Opquast: test descriptions', e));
    } else {
      // Manual test
      const procType = document.createElement('span');
      procType.className = 'procedure-type manual';
      procType.textContent = t(L, 'procManual');
      procContent.appendChild(procType);
    }

    procSec.appendChild(procContent);
    frag.appendChild(procSec);
  }

  // ---- 5. Details (occurrences, collapsed by default) ----
  if (row.details.length) {
    const occSec = document.createElement('section');
    occSec.className = 'detail-occurrences collapsed';

    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'occ-toggle';
    toggle.innerHTML = `<span class="occ-arrow">▸</span> ${t(L, 'secDetails')} (${row.details.length})`;

    const ul = document.createElement('ul');
    ul.className = 'occurrences';
    ul.hidden = true;

    toggle.addEventListener('click', () => {
      const isCollapsed = occSec.classList.toggle('collapsed');
      ul.hidden = isCollapsed;
      toggle.querySelector('.occ-arrow')!.textContent = isCollapsed ? '▸' : '▾';
      // Render occurrences on first expand
      if (!isCollapsed && ul.children.length === 0) {
        for (let i = 0; i < row.details.length; i++) {
          ul.appendChild(occurrence(row.details[i]!, i + 1));
        }
      }
    });

    occSec.append(toggle, ul);
    frag.appendChild(occSec);
  }

  // ---- 6. Feedback section (only if participateFeedback is enabled) ----
  if (state.participateFeedback) {
    const fbSec = document.createElement('section');
    fbSec.className = 'detail-feedback';

    const fbH3 = document.createElement('h3');
    fbH3.textContent = t(L, 'fbTitle');
    fbSec.appendChild(fbH3);

    const fbComment = document.createElement('textarea');
    fbComment.className = 'feedback-comment';
    fbComment.rows = 2;
    fbComment.placeholder = t(L, 'fbCommentPlaceholder');

    const saveBtn = document.createElement('button');
    saveBtn.type = 'button';
    saveBtn.className = 'feedback-btn feedback-save';
    saveBtn.textContent = t(L, 'fbSend');
    saveBtn.addEventListener('click', () => {
      const text = fbComment.value.trim();
      if (!text || saveBtn.disabled) return;
      // One at a time: a second click while the first is pending would file it twice.
      saveBtn.disabled = true;
      // Cleared only once sent: a refused replacement or an unknown page keeps what was typed.
      void sendFeedback(row, 'note', text)
        .then((sent) => {
          if (sent) fbComment.value = '';
        })
        .finally(() => (saveBtn.disabled = false));
    });

    const hint = document.createElement('p');
    hint.className = 'feedback-hint';
    hint.textContent = t(L, 'fbHint');

    fbSec.append(fbComment, saveBtn, hint);
    frag.appendChild(fbSec);
  }

  els.detailContent.replaceChildren(frag);
}

/**
 * Public URL of a criterion's checklist card on checklists.opquast.com, localized by UI language.
 * `ref` is the criterion's fiche number (criterion.name, e.g. "15"); returns null when absent so the
 * title stays plain text rather than a dangling link.
 *   fr → https://checklists.opquast.com/fr/qualite-numerique/<ref>
 *   en → https://checklists.opquast.com/en/digital-quality/<ref>
 */
function ficheUrl(lang: Lang, ref: string | undefined): string | null {
  if (!ref) return null;
  const path = lang === 'en' ? 'en/digital-quality' : 'fr/qualite-numerique';
  return `https://checklists.opquast.com/${path}/${encodeURIComponent(ref)}`;
}

function occurrence(d: Detail, num: number): HTMLLIElement {
  const li = document.createElement('li');

  const numSpan = document.createElement('span');
  numSpan.className = 'occ-num';
  numSpan.textContent = String(num);

  const body = document.createElement('div');
  body.className = 'occ-body';

  const snippet = document.createElement('div');
  snippet.className = 'occ-snippet';
  snippet.textContent = occurrenceSnippet(d);
  body.appendChild(snippet);

  const locator = d.xpath || d.selector;
  if (locator) {
    const loc = document.createElement('div');
    loc.className = 'occ-locator';
    loc.textContent = locator;
    body.appendChild(loc);

    const btn = document.createElement('button');
    btn.className = 'inspect';
    btn.type = 'button';
    btn.textContent = t(state.lang, 'inspect');
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      inspect(d);
    });
    body.appendChild(btn);

    // Highlight the matching element in the inspected page while hovering the occurrence.
    li.addEventListener('mouseenter', () => highlightElement(d));
    li.addEventListener('mouseleave', clearHighlight);
  }

  li.append(numSpan, body);
  return li;
}

const SNIPPET_MAX = 200; // characters of an occurrence shown before it is cut

/** Neutral one-line representation: the decoded snippet the engine captured (markup OR content). */
function occurrenceSnippet(d: Detail): string {
  const raw = d.text && d.text.trim() ? decodeEntities(d.text) : reconstructTag(d);
  const oneLine = raw.replace(/\s+/g, ' ').trim();
  if (!oneLine) return t(state.lang, 'element');
  return oneLine.length > SNIPPET_MAX ? oneLine.slice(0, SNIPPET_MAX) + '…' : oneLine;
}

// Results table: filtering + sorting (`visibleRows`), row rendering with hover status-change buttons
// (`renderTable`), and the sortable-header wiring (`wireSorting`).

import { els, state, STATUS_ICONS, STATUSES, CHANGE_STATUSES } from './context';
import { t, statusLabel } from '@/lib/ui-strings';
import { esc } from './html';
import type { ResultRow, Status } from '@/lib/types';
import type { CombinedResultRow } from '@/lib/result-store';
import { changeResult } from './mutations';
import { openModal } from './modal-view';

export function visibleRows(): CombinedResultRow[] {
  const rows = state.rows.filter((r) => {
    if (state.hiddenStatuses.has(r.result)) return false;
    // Filter by search
    if (state.search) {
      const c = r.criterion;
      const hay =
        `${r.id} ${c?.name ?? ''} ${c?.thema ?? ''} ${c?.description ?? ''} ${(c?.tags ?? []).join(' ')}`.toLowerCase();
      if (!hay.includes(state.search)) return false;
    }
    return true;
  });
  const key = state.sortKey;
  const val = (r: ResultRow): string =>
    key === 'ref'
      ? (r.criterion?.name ?? '').padStart(10, '0') // Numeric sort for ref
      : key === 'result'
        ? String(STATUSES.indexOf(r.result as never)).padStart(2, '0') // panel order, not the codes'
        : key === 'thema'
          ? (r.criterion?.thema ?? '')
          : (r.criterion?.description ?? '');
  rows.sort((a, b) => val(a).localeCompare(val(b)) * state.sortDir);
  return rows;
}

export function renderTable() {
  const rows = visibleRows();
  if (rows.length === 0) {
    const m = state.rows.length === 0 ? t(state.lang, 'emptyStart') : t(state.lang, 'emptyNone');
    els.body.innerHTML = `<tr class="empty"><td colspan="5">${esc(m)}</td></tr>`;
    return;
  }
  els.body.replaceChildren(
    ...rows.map((r) => {
      const tr = document.createElement('tr');
      tr.dataset.id = r.id;
      if (r.id === state.selectedId) tr.className = 'selected';
      if (r.userModified) tr.classList.add('user-modified');
      const modifiedMark = r.userModified
        ? `<span class="modified-dot" role="img" title="${esc(t(state.lang, 'edited'))}" aria-label="${esc(t(state.lang, 'edited'))}">●</span>`
        : '';

      // Build hover action buttons HTML
      const actionButtons = CHANGE_STATUSES.map(
        (st) =>
          `<button type="button" class="status-btn ${st}${st === r.result ? ' active' : ''}" data-status="${st}" title="${esc(statusLabel(state.lang, st))}" aria-label="${esc(t(state.lang, 'setResult').replace('{s}', statusLabel(state.lang, st)))}" aria-pressed="${st === r.result}"><span aria-hidden="true">${STATUS_ICONS[st]}</span></button>`,
      ).join('');

      // Build tags HTML
      const tags = r.criterion?.tags ?? [];
      const tagsHtml =
        tags.length > 0
          ? tags.map((tag) => `<span class="tag-mini">${esc(tag)}</span>`).join('')
          : '';

      // Layout: N° | Rubrique | Description | Tags | Status icon + hover actions
      tr.innerHTML = `
        <td class="col-num">${esc(r.criterion?.name ?? '')}</td>
        <td class="col-thema">${esc(r.criterion?.thema ?? '')}</td>
        <td><button type="button" class="row-open">${esc(r.criterion?.description ?? '')}</button></td>
        <td class="col-tags">${tagsHtml}</td>
        <td class="col-status">
          <div class="status-cell">
            <div class="status-current">
              <span class="status-icon ${esc(r.result)}" role="img" title="${esc(statusLabel(state.lang, r.result))}" aria-label="${esc(statusLabel(state.lang, r.result))}">${STATUS_ICONS[r.result] ?? '?'}</span>
              ${modifiedMark}
            </div>
            <div class="status-actions">${actionButtons}</div>
          </div>
        </td>`;

      // Wire status change buttons
      tr.querySelectorAll('.status-btn').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const newStatus = (btn as HTMLElement).dataset.status as Status;
          if (newStatus && newStatus !== r.result) {
            changeResult(r.id, newStatus);
          }
        });
      });

      // Click anywhere on the row opens the detail; the description button is the keyboard's way in.
      tr.addEventListener('click', () => openModal(r.id));
      return tr;
    }),
  );
}

export function wireSorting() {
  els.thead.querySelectorAll('th.sortable').forEach((th) => {
    th.addEventListener('click', () => {
      const key = (th as HTMLElement).dataset.sort as typeof state.sortKey;
      if (state.sortKey === key) state.sortDir = (state.sortDir * -1) as 1 | -1;
      else {
        state.sortKey = key;
        state.sortDir = 1;
      }
      els.thead.querySelectorAll('th').forEach((h) => h.removeAttribute('aria-sort'));
      (th as HTMLElement).setAttribute(
        'aria-sort',
        state.sortDir === 1 ? 'ascending' : 'descending',
      );
      renderTable();
    });
  });
}

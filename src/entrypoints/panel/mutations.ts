// User result mutations (optimistic local update + persist via the background port): override the
// verdict, save a comment, re-test a single criterion, or reset to the automatic result.

import { els, state, port } from './context';
import { computeScores } from '@/lib/scoring';
import { pickLang } from '@/lib/checklists';
import type { Status } from '@/lib/types';
import type { CombinedResultRow } from '@/lib/result-store';
import { renderScoresView } from './scores-view';
import { renderTable } from './table-view';
import { renderModalDetail } from './modal-view';

export function changeResult(criterionId: string, newResult: Status) {
  if (!state.currentUrl) return;
  const row = state.rows.find((r) => r.id === criterionId);
  if (row) {
    if (newResult === row.result) return;
    // The automatic value is kept the first time the result changes, whatever else changed before.
    if (row.originalResult === undefined) row.originalResult = row.result;
    row.result = newResult;
    if (newResult === row.originalResult) delete row.originalResult; // back where it started
    persistOverride(row);
  } else {
    port.postMessage({
      type: 'SET_OVERRIDE',
      url: state.currentUrl,
      criterionId,
      result: newResult,
    });
  }

  state.scores = computeScores(state.rows);
  renderScoresView();
  renderTable();
}

export function saveComment(criterionId: string, comment: string) {
  if (!state.currentUrl) return;
  const row = state.rows.find((r) => r.id === criterionId);
  if (row) {
    if (comment === (row.comment ?? '')) return; // nothing to save: no override for nothing
    if (row.originalComment === undefined) row.originalComment = row.comment ?? '';
    row.comment = comment;
    if (comment === row.originalComment) delete row.originalComment;
    persistOverride(row);
  } else {
    port.postMessage({ type: 'SET_OVERRIDE', url: state.currentUrl, criterionId, comment });
  }

  renderTable();
}

/**
 * Store what the user changed on `row`, or drop the override once both the result and the comment
 * are back to their automatic values. Returns whether the row is still modified.
 */
function persistOverride(row: CombinedResultRow): boolean {
  const wasModified = !!row.userModified;
  row.userModified = row.originalResult !== undefined || row.originalComment !== undefined;
  port.postMessage(
    row.userModified
      ? {
          type: 'SET_OVERRIDE',
          url: state.currentUrl,
          criterionId: row.id,
          result: row.result,
          comment: row.comment ?? '',
        }
      : { type: 'CLEAR_OVERRIDE', url: state.currentUrl, criterionId: row.id },
  );
  // The detail shows the "changed" note and the undo button only while the row is modified.
  if (row.userModified !== wasModified && state.modalOpen && state.selectedId === row.id) {
    renderModalDetail();
  }
  return row.userModified;
}

export function reanalyzeCriterion(criterionId: string) {
  if (!state.currentUrl || !state.analysisId) return;
  const slug = els.checklist.value;
  const info = state.manifest.find((c) => c.slug === slug);
  const lang = info ? pickLang(info, els.lang.value) : els.lang.value;
  port.postMessage({
    type: 'REANALYZE_CRITERION',
    tabId: browser.devtools.inspectedWindow.tabId,
    slug,
    lang,
    criterionId,
    analysisId: state.analysisId,
    url: state.currentUrl || undefined,
    requestId: state.requestId,
  });
}

export function resetToAutomatic(criterionId: string) {
  if (!state.currentUrl) return;
  // Status feedback handled by UI

  const row = state.rows.find((r) => r.id === criterionId);
  if (row && row.userModified) {
    if (row.originalResult !== undefined) {
      row.result = row.originalResult;
      delete row.originalResult;
    }
    if (row.originalComment !== undefined) {
      row.comment = row.originalComment;
      delete row.originalComment;
    }
    row.userModified = false;
  }

  port.postMessage({
    type: 'CLEAR_OVERRIDE',
    url: state.currentUrl || undefined,
    criterionId,
  });

  state.scores = computeScores(state.rows);
  renderScoresView();
  renderTable();

  if (row) renderModalDetail();
}

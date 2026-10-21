// User result mutations (optimistic local update + persist via the background port): override the
// verdict, save a comment, re-test a single criterion, or reset to the automatic result.

import { els, state, port } from './context';
import { computeScores } from '@/lib/scoring';
import { pickLang } from '@/lib/checklists';
import type { Status } from '@/lib/types';
import { renderScoresView } from './scores-view';
import { renderTable } from './table-view';
import { renderModalDetail } from './modal-view';

export function changeResult(criterionId: string, newResult: Status) {
  if (!state.currentUrl) return;
  // Status feedback handled by UI

  const row = state.rows.find((r) => r.id === criterionId);
  if (row) {
    if (!row.userModified) {
      row.originalResult = row.result;
    }
    row.result = newResult;
    row.userModified = true;
  }

  port.postMessage({
    type: 'SET_OVERRIDE',
    url: state.currentUrl || undefined,
    criterionId,
    result: newResult,
  });

  state.scores = computeScores(state.rows);
  renderScoresView();
  renderTable();
}

export function saveComment(criterionId: string, comment: string) {
  if (!state.currentUrl) return;
  // Status feedback handled by UI

  const row = state.rows.find((r) => r.id === criterionId);
  if (row) {
    if (!row.userModified && row.comment !== comment) {
      row.originalComment = row.comment;
    }
    row.comment = comment;
    if (row.comment !== row.originalComment) {
      row.userModified = true;
    }
  }

  port.postMessage({
    type: 'SET_OVERRIDE',
    url: state.currentUrl || undefined,
    criterionId,
    comment,
  });

  renderTable();
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

// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing';
import { loadPanelContext, portLog } from './helpers/panel';
import type { CombinedResultRow } from '@/lib/result-store';

async function load() {
  fakeBrowser.reset();
  const context = await loadPanelContext();
  const mutations = await import('@/entrypoints/panel/mutations');
  const row: CombinedResultRow = {
    id: '17',
    result: 'c',
    results_list: [],
    comment: 'auto',
    details: [],
    time: 0,
    criterion: {},
    auto: true,
    forcedNt: false,
    userModified: false,
  };
  context.state.currentUrl = 'https://example.test/';
  context.state.rows = [row];
  portLog.sent = [];
  return { ...context, ...mutations, row };
}

const sentTypes = () => portLog.sent.map((m) => m.type);

describe('manual changes', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('is no longer modified once the result is set back to the automatic one', async () => {
    const { changeResult, row } = await load();
    changeResult('17', 'nc');
    expect(row).toMatchObject({ result: 'nc', userModified: true, originalResult: 'c' });
    changeResult('17', 'c');
    expect(row.userModified).toBe(false);
    expect(row.originalResult).toBeUndefined();
    expect(sentTypes()).toEqual(['SET_OVERRIDE', 'CLEAR_OVERRIDE']);
  });

  it('stores nothing for a comment saved unchanged', async () => {
    const { saveComment, row } = await load();
    saveComment('17', 'auto');
    expect(row.userModified).toBe(false);
    expect(portLog.sent).toEqual([]);
  });

  it('keeps the automatic comment after the result changed first, so both can be undone', async () => {
    const { changeResult, saveComment, resetToAutomatic, row } = await load();
    changeResult('17', 'nc');
    saveComment('17', 'mine');
    expect(row).toMatchObject({ originalResult: 'c', originalComment: 'auto' });
    resetToAutomatic('17');
    expect(row).toMatchObject({ result: 'c', comment: 'auto', userModified: false });
  });

  it('keeps the automatic result after the comment changed first', async () => {
    const { changeResult, saveComment, row } = await load();
    saveComment('17', 'mine');
    changeResult('17', 'na');
    expect(row).toMatchObject({ originalResult: 'c', originalComment: 'auto', userModified: true });
    // Back to the automatic result: still modified, by the comment.
    changeResult('17', 'c');
    expect(row.userModified).toBe(true);
    expect(portLog.sent.at(-1)).toMatchObject({
      type: 'SET_OVERRIDE',
      result: 'c',
      comment: 'mine',
    });
  });
});

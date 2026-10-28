// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing';
import { loadPanelContext } from './helpers/panel';
import type { CombinedResultRow } from '@/lib/result-store';
import type { Status } from '@/lib/types';

function row(id: string, result: Status, tags: string[] = []): CombinedResultRow {
  return {
    id,
    result,
    results_list: [],
    comment: '',
    details: [],
    time: 0,
    criterion: { name: id, description: `criterion ${id}`, tags },
    auto: true,
    forcedNt: false,
    userModified: false,
  };
}

async function load() {
  fakeBrowser.reset();
  const context = await loadPanelContext();
  const view = await import('@/entrypoints/panel/table-view');
  return { ...context, ...view };
}

describe('results table', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('finds a criterion by its tags', async () => {
    const { state, visibleRows } = await load();
    state.rows = [row('1', 'c', ['SEO']), row('2', 'c', ['Accessibilité'])];
    state.search = 'seo';
    expect(visibleRows().map((r) => r.id)).toEqual(['1']);
  });

  it('sorts by result in the order the panel lists them, not by code', async () => {
    const { state, visibleRows } = await load();
    state.rows = [row('1', 'nt'), row('2', 'nc'), row('3', 'na'), row('4', 'c'), row('5', 'i')];
    state.sortKey = 'result';
    state.sortDir = 1;
    expect(visibleRows().map((r) => r.result)).toEqual(['c', 'nc', 'i', 'na', 'nt']);
  });
});

// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import { loadPanelContext } from './helpers/panel';
import type { CombinedResultRow } from '@/lib/result-store';

async function loadModalView() {
  const context = await loadPanelContext();
  const view = await import('@/entrypoints/panel/modal-view');
  return { ...context, ...view };
}

function row(overrides: Partial<CombinedResultRow> = {}): CombinedResultRow {
  return {
    id: '53921',
    result: 'c',
    results_list: [],
    comment: '',
    details: [],
    time: 0,
    criterion: { name: '15', description: 'The privacy policy is available from any page.' },
    auto: false,
    forcedNt: false,
    userModified: false,
    ...overrides,
  };
}

describe('renderModalDetail — fiche title link', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('links the title to the French fiche URL when lang is fr', async () => {
    const { els, state, renderModalDetail } = await loadModalView();
    state.rows = [row()];
    state.selectedId = '53921';
    state.lang = 'fr';

    renderModalDetail();

    const link = els.detailContent.querySelector('#detail-title a.fiche-link') as HTMLAnchorElement;
    expect(link).not.toBeNull();
    expect(link.getAttribute('href')).toBe(
      'https://checklists.opquast.com/fr/qualite-numerique/15',
    );
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.textContent).toContain('privacy policy');
  });

  it('links the title to the English fiche URL when lang is en', async () => {
    const { els, state, renderModalDetail } = await loadModalView();
    state.rows = [row()];
    state.selectedId = '53921';
    state.lang = 'en';

    renderModalDetail();

    const link = els.detailContent.querySelector('#detail-title a.fiche-link') as HTMLAnchorElement;
    expect(link.getAttribute('href')).toBe('https://checklists.opquast.com/en/digital-quality/15');
  });

  it('renders a plain title (no link) when the criterion has no fiche number', async () => {
    const { els, state, renderModalDetail } = await loadModalView();
    state.rows = [row({ criterion: { description: 'No reference criterion' } })];
    state.selectedId = '53921';
    state.lang = 'fr';

    renderModalDetail();

    expect(els.detailContent.querySelector('#detail-title a')).toBeNull();
    expect(els.detailContent.querySelector('#detail-title')!.textContent).toContain(
      'No reference criterion',
    );
  });
});

describe('detail modal — keyboard', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  async function openOnFirst() {
    const view = await loadModalView();
    view.state.rows = [row({ id: 'a' }), row({ id: 'b' })];
    view.setupModal();
    view.openModal('a');
    return view;
  }
  const key = (target: EventTarget, k: string) =>
    target.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));

  it('moves to the next criterion with an arrow key', async () => {
    const { state } = await openOnFirst();
    key(document.body, 'ArrowDown');
    expect(state.selectedId).toBe('b');
  });

  it('leaves the arrows to a text field being edited', async () => {
    const { state, els } = await openOnFirst();
    const textarea = els.detailContent.querySelector('textarea')!;
    key(textarea, 'ArrowDown');
    expect(state.selectedId).toBe('a');
  });

  it('lets a confirmation box take Escape without closing the detail behind it', async () => {
    const { state } = await openOnFirst();
    const backdrop = document.createElement('div');
    backdrop.className = 'confirm-backdrop';
    document.body.appendChild(backdrop);
    key(document.body, 'Escape');
    expect(state.modalOpen).toBe(true);
    backdrop.remove();
    key(document.body, 'Escape');
    expect(state.modalOpen).toBe(false);
  });

  it('offers to undo a change to the comment alone', async () => {
    const { els, state, renderModalDetail } = await loadModalView();
    state.rows = [row({ userModified: true, originalComment: '', comment: 'mine' })];
    state.selectedId = '53921';
    renderModalDetail();
    expect(els.detailContent.querySelector('.reset-btn')).not.toBeNull();
  });
});

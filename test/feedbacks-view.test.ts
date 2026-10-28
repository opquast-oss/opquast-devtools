// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Pinned so the suite does not depend on the gitignored build artefact, and so a test can decide
// whether a feedback agrees with the installed engine.
vi.mock('@/engine/engine-version.generated', () => ({
  ENGINE_VERSION: {
    engine: '2.0.0-alpha.1',
    submodule: '31a16d9bcb',
    overlay: '0.6.0',
    hash: 'a3f1c8',
    fullHash: 'a3f1c8'.padEnd(64, '0'),
  },
}));
import { fakeBrowser } from 'wxt/testing';
import { loadPanelContext } from './helpers/panel';
import type { Feedback } from '@/lib/result-store';

async function loadView() {
  fakeBrowser.reset();
  const context = await loadPanelContext();
  const view = await import('@/entrypoints/panel/feedbacks-view');
  const appLib = await import('@/lib/app-feedback');
  return { ...context, ...view, appLib };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

function resultFeedback(over: Partial<Feedback> = {}): Feedback {
  return {
    id: 'f1',
    analysisId: 'a1',
    analysisTimestamp: 1000,
    versions: { ext: '0.6.0', engine: '2.0.0-alpha.1', overlay: '0.6.0', hash: 'abc123' },
    url: 'https://example.test/',
    criterionId: '17',
    criterionRef: '17',
    description: 'Account creation is possible without a third party.',
    slug: 's',
    obtainedResult: 'c',
    kind: 'confirm',
    comment: 'non',
    createdAt: 200,
    ...over,
  };
}

describe('feedbacks-view — unified table', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('renders one row per feedback across both origins', async () => {
    const { els, state, renderFeedbacks } = await loadView();
    state.manifest = [{ slug: 's', names: { fr: 'Basics' }, langs: ['fr'] }];
    state.feedbacks = [resultFeedback()];
    state.appFeedbacks = [{ id: 'a1', category: 'idea', message: 'okk,lqsd', createdAt: 100 }];

    renderFeedbacks();

    const rows = els.fbTbody.querySelectorAll('tr.fb-row');
    expect(rows).toHaveLength(2);
    expect(els.fbTbody.textContent).toContain('Résultats');
    expect(els.fbTbody.textContent).toContain('Avis appli');
    // most recent first (result createdAt 200 > app 100)
    expect((rows[0] as HTMLElement).dataset.key).toBe('result:f1');
    // origin is qualified inline with the checklist name + rule number
    expect((rows[0] as HTMLElement).children[1]!.textContent).toBe('Résultats · Basics · Règle 17');
    expect(els.fbTable.hidden).toBe(false);
  });

  it('shows the empty state when there is no feedback', async () => {
    const { els, state, renderFeedbacks } = await loadView();
    state.feedbacks = [];
    state.appFeedbacks = [];
    renderFeedbacks();
    expect(els.fbTable.hidden).toBe(true);
    expect(els.fbEmpty.hidden).toBe(false);
  });

  it('select-all toggles selection and enables bulk actions', async () => {
    const { els, state, setupFeedbacks, renderFeedbacks } = await loadView();
    setupFeedbacks();
    state.feedbacks = [resultFeedback()];
    state.appFeedbacks = [{ id: 'a1', category: 'bug', message: 'x', createdAt: 1 }];
    renderFeedbacks();

    expect(els.fbDelete.disabled).toBe(true);
    els.fbSelectAll.checked = true;
    els.fbSelectAll.dispatchEvent(new Event('change'));

    expect(state.fbSelected.size).toBe(2);
    expect(els.fbDelete.disabled).toBe(false);
    expect(els.fbTransmit.disabled).toBe(false);
    expect(els.fbSelection.textContent).toContain('2');
  });

  it('expands a result row to reveal its detail', async () => {
    const { els, state, renderFeedbacks } = await loadView();
    state.feedbacks = [resultFeedback()];
    renderFeedbacks();

    const expandBtn = els.fbTbody.querySelector('tr.fb-row .fb-action') as HTMLButtonElement;
    expandBtn.click();

    const detail = els.fbTbody.querySelector('tr.fb-detail');
    expect(detail).not.toBeNull();
    expect(detail!.textContent).toContain('Account creation is possible');
    expect(detail!.querySelector('a.fb-url')?.getAttribute('href')).toBe('https://example.test/');
  });

  it('inline-edits an app feedback', async () => {
    const { els, state, setupFeedbacks, renderFeedbacks, appLib } = await loadView();
    setupFeedbacks();
    state.appFeedbacks = await appLib.addAppFeedback({ category: 'bug', message: 'old' }, 1);
    renderFeedbacks();

    // click the edit (✎) action — second .fb-action in the row
    const actions = els.fbTbody.querySelectorAll('tr.fb-row .fb-action');
    (actions[1] as HTMLButtonElement).click();

    const ta = els.fbTbody.querySelector('tr.fb-edit textarea') as HTMLTextAreaElement;
    expect(ta.value).toBe('old');
    ta.value = 'updated';
    els.fbTbody
      .querySelector('tr.fb-edit form')!
      .dispatchEvent(new Event('submit', { cancelable: true }));
    await flush();

    const stored = await appLib.getAppFeedbacks();
    expect(stored[0]!.message).toBe('updated');
  });

  it('keeps an edit in progress when the table is drawn again', async () => {
    const { els, state, setupFeedbacks, renderFeedbacks, appLib } = await loadView();
    setupFeedbacks();
    state.appFeedbacks = await appLib.addAppFeedback({ category: 'bug', message: 'old' }, 1);
    renderFeedbacks();
    (els.fbTbody.querySelectorAll('tr.fb-row .fb-action')[1] as HTMLButtonElement).click();
    (els.fbTbody.querySelector('tr.fb-edit textarea') as HTMLTextAreaElement).value = 'typing…';
    (els.fbTbody.querySelector('tr.fb-edit select') as HTMLSelectElement).value = 'idea';

    renderFeedbacks(); // e.g. the result feedbacks came back from the background

    expect((els.fbTbody.querySelector('tr.fb-edit textarea') as HTMLTextAreaElement).value).toBe(
      'typing…',
    );
    expect((els.fbTbody.querySelector('tr.fb-edit select') as HTMLSelectElement).value).toBe(
      'idea',
    );
  });

  it('lists a feedback whose category it does not know as "other"', async () => {
    const { els, state, renderFeedbacks } = await loadView();
    state.lang = 'en';
    state.appFeedbacks = [{ id: 'a1', category: 'praise' as never, message: 'x', createdAt: 1 }];
    renderFeedbacks();
    expect(els.fbTbody.querySelector('.fb-type-badge')?.textContent).toBe('Other');
  });

  it('deletes an app feedback row after confirming in the dialog', async () => {
    const { els, state, setupFeedbacks, renderFeedbacks, appLib } = await loadView();
    setupFeedbacks();
    state.appFeedbacks = await appLib.addAppFeedback({ category: 'other', message: 'bye' }, 1);
    renderFeedbacks();

    // delete (×) is the third .fb-action → opens the in-panel confirm dialog
    const actions = els.fbTbody.querySelectorAll('tr.fb-row .fb-action');
    (actions[2] as HTMLButtonElement).click();
    const yes = document.querySelector('.confirm-backdrop .export-btn') as HTMLButtonElement;
    expect(yes).not.toBeNull();
    yes.click();
    await flush();

    expect(await appLib.getAppFeedbacks()).toEqual([]);
  });

  it('keeps the feedback when the delete dialog is cancelled', async () => {
    const { els, state, setupFeedbacks, renderFeedbacks, appLib } = await loadView();
    setupFeedbacks();
    state.appFeedbacks = await appLib.addAppFeedback({ category: 'other', message: 'stay' }, 1);
    renderFeedbacks();

    const actions = els.fbTbody.querySelectorAll('tr.fb-row .fb-action');
    (actions[2] as HTMLButtonElement).click();
    const no = document.querySelector('.confirm-backdrop .icon-btn') as HTMLButtonElement;
    no.click();
    await flush();

    expect(await appLib.getAppFeedbacks()).toHaveLength(1);
  });
});

describe('transmitSelected — the draft handed to the mail client', () => {
  const here = { ext: '0.6.0', engine: '2.0.0-alpha.1', overlay: '0.6.0', hash: 'a3f1c8' };

  async function draftFor(feedbacks: Feedback[]) {
    const { els, state, setupFeedbacks, renderFeedbacks } = await loadView();
    setupFeedbacks();
    state.feedbacks = feedbacks;
    renderFeedbacks();
    els.fbSelectAll.checked = true;
    els.fbSelectAll.dispatchEvent(new Event('change'));

    let url = '';
    // The extension never sends anything — it opens a prefilled draft the user reads and edits.
    fakeBrowser.tabs.create = (async (info: { url?: string }) => {
      url = info.url ?? '';
      return {} as never;
    }) as never;
    els.fbTransmit.click();
    // Only the body: the subject also carries the product name, which would double every count.
    return decodeURIComponent(url.split('&body=')[1] ?? '');
  }

  it('states the environment once, not on every remark', async () => {
    const draft = await draftFor([
      resultFeedback({ id: 'f1', versions: here }),
      resultFeedback({ id: 'f2', versions: here }),
    ]);
    expect(draft.match(/Opquast DevTools —/g)).toHaveLength(1);
    expect(draft).toContain('2.0.0-alpha.1');
    expect(draft).toContain('a3f1c8');
  });

  it('says which verdict was commented on', async () => {
    // "[Résultats · Confirmé] 122 — …" never said WHAT was confirmed.
    const draft = await draftFor([resultFeedback({ obtainedResult: 'nc', versions: here })]);
    expect(draft).toMatch(/\[.*Non conforme\]/);
  });

  it('flags only the lines produced by a different engine', async () => {
    const draft = await draftFor([
      resultFeedback({ id: 'f1', versions: here }),
      resultFeedback({ id: 'f2', versions: { ...here, hash: '9c02de', engine: '1.9.0' } }),
    ]);
    // A selection can mix runs, and after an update it can mix engines. Silent otherwise.
    expect(draft).toContain('9c02de');
    expect(draft.match(/1\.9\.0/g)).toHaveLength(1);
  });
});

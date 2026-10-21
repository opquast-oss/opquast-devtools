// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Pinned rather than read from the build artefact: engine-version.generated.ts is written by
// `npm run sync-assets` and gitignored.
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

async function loadAbout() {
  fakeBrowser.reset();
  const context = await loadPanelContext();
  const b = globalThis as unknown as { browser: { runtime: { getManifest: () => unknown } } };
  b.browser.runtime.getManifest = () => ({ version: '0.5.0' });
  const view = await import('@/entrypoints/panel/about-view');
  return { ...context, ...view };
}

describe('about-view', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('renders the title, manifest version and localized sections (fr)', async () => {
    const { els, state, renderAbout } = await loadAbout();
    state.lang = 'fr';
    renderAbout();

    expect(els.panelAbout.querySelector('.about-title')?.textContent).toBe('Opquast DevTools');
    expect(els.panelAbout.querySelector('.about-version')?.textContent).toContain('0.5.0');
    // "what am I running right now" — the one place a user goes on purpose to find out.
    const engine = els.panelAbout.querySelector('.about-engine')?.textContent ?? '';
    expect(engine).toContain('2.0.0-alpha.1');
    expect(engine).toContain('a3f1c8');
    expect(els.panelAbout.textContent).toContain('Confidentialité');
    expect(els.panelAbout.textContent).toContain('CC BY-SA 4.0');
    expect(els.panelAbout.querySelector('a')?.getAttribute('href')).toContain('opquast.com');
  });

  it('localizes to English', async () => {
    const { els, state, renderAbout } = await loadAbout();
    state.lang = 'en';
    renderAbout();
    expect(els.panelAbout.textContent).toContain('Privacy');
    expect(els.panelAbout.textContent).toContain('Licensing');
  });
});

describe('about-view — app feedback form', () => {
  const flush = () => new Promise((r) => setTimeout(r, 0));

  it('is offered only while participation is on', async () => {
    const { els, state, renderAbout } = await loadAbout();
    state.participateFeedback = false;
    renderAbout();
    expect(els.panelAbout.querySelector('#app-feedback-form')).toBeNull();
  });

  it('saves a general app feedback, and ignores an empty message', async () => {
    const { els, state, renderAbout } = await loadAbout();
    const appLib = await import('@/lib/app-feedback');
    state.participateFeedback = true;
    renderAbout();

    const form = els.panelAbout.querySelector('#app-feedback-form') as HTMLFormElement;
    const message = form.querySelector('#app-feedback-message') as HTMLTextAreaElement;
    (form.querySelector('#app-feedback-category') as HTMLSelectElement).value = 'idea';

    message.value = '   ';
    form.dispatchEvent(new Event('submit', { cancelable: true }));
    await flush();
    expect(await appLib.getAppFeedbacks()).toEqual([]);

    message.value = 'A keyboard shortcut to re-run';
    form.dispatchEvent(new Event('submit', { cancelable: true }));
    await flush();
    const saved = await appLib.getAppFeedbacks();
    expect(saved).toMatchObject([{ category: 'idea', message: 'A keyboard shortcut to re-run' }]);
    expect(state.appFeedbacks).toHaveLength(1);
    expect(els.fbTbody.querySelectorAll('tr.fb-row')).toHaveLength(1);
    expect(message.value).toBe('');
  });
});

// @vitest-environment happy-dom
// The options page reports what goes wrong instead of failing silently.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing';

const manifest = [
  { slug: '901-opquast-basics', names: { fr: 'Basics', en: 'Basics' }, langs: ['fr', 'en'] },
  { slug: 'v5', names: { fr: 'V5', en: 'V5' }, langs: ['fr', 'en'] },
];

vi.mock('@/lib/checklists', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/checklists')>()),
  loadChecklistManifest: vi.fn(async () => manifest),
}));
vi.mock('@/lib/result-store', () => ({
  clearAnalyses: vi.fn(async () => {}),
  countAnalyses: vi.fn(async () => 0),
  listFeedbacks: vi.fn(async () => []),
}));

const flush = () => new Promise((r) => setTimeout(r, 0));

async function openPage() {
  // Not implemented by the fake browser.
  const listener = { addListener: () => {}, removeListener: () => {} };
  Object.assign(fakeBrowser.permissions, {
    contains: async () => true,
    onAdded: listener,
    onRemoved: listener,
  });
  const html = readFileSync(join(process.cwd(), 'src/entrypoints/options/index.html'), 'utf8');
  document.body.innerHTML = html
    .replace(/[\s\S]*<body[^>]*>/, '')
    .replace(/<\/body>[\s\S]*/, '')
    .replace(/<script[\s\S]*?<\/script>/g, '');
  vi.resetModules();
  await import('@/entrypoints/options/main');
  await flush();
  return {
    status: () => document.getElementById('saved')!.textContent ?? '',
    box: (slug: string) =>
      document.querySelector<HTMLInputElement>(`#checklists input[value="${slug}"]`)!,
  };
}

describe('options page', () => {
  beforeEach(() => {
    fakeBrowser.reset();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('explains why the last checklist cannot be unticked', async () => {
    const page = await openPage();
    const basics = page.box('901-opquast-basics');
    basics.checked = false;
    basics.dispatchEvent(new Event('change', { bubbles: true }));
    expect(basics.checked).toBe(true);
    expect(page.status()).toMatch(/au moins un référentiel/);
  });

  it('says when a preference could not be saved', async () => {
    const page = await openPage();
    vi.spyOn(fakeBrowser.storage.local, 'set').mockRejectedValue(new Error('quota'));
    const autoRun = document.getElementById('autoRun') as HTMLInputElement;
    autoRun.checked = !autoRun.checked;
    autoRun.dispatchEvent(new Event('change'));
    await flush();
    expect(page.status()).toMatch(/^✗/);
  });

  it('says when the preferences could not be read', async () => {
    const { loadChecklistManifest } = await import('@/lib/checklists');
    vi.mocked(loadChecklistManifest).mockRejectedValueOnce(new Error('missing'));
    const page = await openPage();
    expect(page.status()).toMatch(/Impossible de lire/);
  });
});

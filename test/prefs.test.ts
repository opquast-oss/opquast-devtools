import { beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing';
import { getPrefs, setPrefs } from '@/lib/prefs';

describe('prefs', () => {
  beforeEach(() => fakeBrowser.reset());

  it('enables Opquast Basics alone on a fresh install', async () => {
    const prefs = await getPrefs();
    expect(prefs.enabledChecklists).toEqual(['901-opquast-basics']);
    expect(prefs.slug).toBe('901-opquast-basics');
  });

  it('keeps the referentials a user chose', async () => {
    await setPrefs({ enabledChecklists: ['901-opquast-basics', '900-opquast-v5'] });
    expect((await getPrefs()).enabledChecklists).toEqual(['901-opquast-basics', '900-opquast-v5']);
  });
});

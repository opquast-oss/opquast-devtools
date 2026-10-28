// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { localizeDocument, t, type StringKey } from '@/lib/ui-strings';

describe('ui strings', () => {
  it('shows an unknown key as itself instead of throwing', () => {
    expect(t('en', 'noSuchKey' as StringKey)).toBe('noSuchKey');
  });

  it('localizes the rest of the page around an unknown key', () => {
    document.body.innerHTML =
      '<span data-i18n="noSuchKey"></span><span data-i18n="actionFailed"></span>';
    localizeDocument('en');
    const spans = document.querySelectorAll('span');
    expect(spans[0]!.textContent).toBe('noSuchKey');
    expect(spans[1]!.textContent).toContain('did not complete');
  });
});

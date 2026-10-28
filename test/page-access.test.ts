// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import {
  classifyAccessFailure,
  isAccessError,
  isAnalysableUrl,
  isPrivateHost,
  isTabReady,
  originPattern,
  type AccessFacts,
} from '@/lib/page-access';
import { renderAccessError } from '@/entrypoints/panel/access-view';

const facts = (f: Partial<AccessFacts>): AccessFacts => ({
  url: 'https://example.com/page',
  incognito: false,
  incognitoAllowed: true,
  originGranted: false,
  ...f,
});

describe('page access diagnosis', () => {
  it('recognises the refusals of both browsers', () => {
    expect(isAccessError('Missing host permission for the tab')).toBe(true);
    expect(isAccessError('Cannot access contents of url "https://x"')).toBe(true);
    expect(isAccessError('NetworkError when attempting to fetch resource.')).toBe(false);
  });

  it('only runs on web pages and local files', () => {
    expect(isAnalysableUrl('https://example.com/')).toBe(true);
    expect(isAnalysableUrl('file:///home/me/page.html')).toBe(true);
    for (const url of [
      'about:newtab',
      'about:blank',
      'view-source:https://x',
      'chrome://newtab',
      undefined,
    ]) {
      expect(isAnalysableUrl(url)).toBe(false);
    }
  });

  it('builds the host pattern that covers the page', () => {
    expect(originPattern('https://example.com:8443/a/b?c')).toBe('https://example.com:8443/*');
    expect(originPattern('file:///home/me/page.html')).toBe('file:///*');
  });

  it('asks for the permission only when it is really missing', () => {
    expect(classifyAccessFailure(facts({ originGranted: false }))).toBe('PERMISSION_DENIED');
    // Firefox hides the URL without the permission: no URL, no check → still a permission question.
    expect(classifyAccessFailure(facts({ url: undefined, originGranted: null }))).toBe(
      'PERMISSION_DENIED',
    );
  });

  it('does not blame the permission when it is granted and the page still refuses', () => {
    expect(classifyAccessFailure(facts({ originGranted: true }))).toBe('PAGE_RESTRICTED');
    expect(classifyAccessFailure(facts({ url: 'about:newtab', originGranted: null }))).toBe(
      'PAGE_RESTRICTED',
    );
  });

  it('points to the private-window setting first', () => {
    expect(
      classifyAccessFailure(
        facts({ incognito: true, incognitoAllowed: false, originGranted: true }),
      ),
    ).toBe('PRIVATE_WINDOW');
    expect(
      classifyAccessFailure(
        facts({ incognito: true, incognitoAllowed: true, originGranted: true }),
      ),
    ).toBe('PAGE_RESTRICTED');
  });
});

describe('tab readiness', () => {
  const page = 'http://example.com/';

  it('waits for the page to finish loading', () => {
    expect(isTabReady({ status: 'loading', url: page }, page)).toBe(false);
    expect(isTabReady({ status: 'complete', url: page }, page)).toBe(true);
  });

  it('does not take the initial about:blank of a new tab for the page', () => {
    expect(isTabReady({ status: 'complete', url: 'about:blank' }, page)).toBe(false);
    expect(isTabReady({ status: 'complete', url: 'about:blank' }, 'about:blank')).toBe(true);
  });

  it('accepts a redirect, and a hidden URL once complete', () => {
    expect(isTabReady({ status: 'complete', url: 'https://example.com/' }, page)).toBe(true);
    expect(isTabReady({ status: 'complete' }, page)).toBe(true);
    expect(isTabReady({ status: 'complete', url: 'about:blank' })).toBe(true);
  });

  it('keeps waiting on a hidden URL when the permission covers the page (Firefox)', () => {
    // Firefox reports the initial about:blank "complete" with its URL hidden.
    expect(isTabReady({ status: 'complete' }, page, true)).toBe(false);
    expect(isTabReady({ status: 'complete', url: page }, page, true)).toBe(true);
    expect(isTabReady({ status: 'complete', url: 'about:blank' }, page, true)).toBe(false);
  });
});

describe('access view', () => {
  const base = { lang: 'fr' as const, isFirefox: true, onOpenSettings: () => {} };

  it('sends a missing permission to the settings, with the Firefox fallback', () => {
    const el = document.createElement('div');
    const onOpenSettings = vi.fn();
    renderAccessError(el, 'PERMISSION_DENIED', { ...base, onOpenSettings });
    expect(el.textContent).toContain('Autorisation nécessaire');
    expect(el.textContent).toContain('about:addons');
    expect(el.textContent).not.toContain("l'icône Opquast");
    el.querySelector<HTMLAnchorElement>('#open-settings-link')!.click();
    expect(onOpenSettings).toHaveBeenCalledOnce();
  });

  it('never asks for a permission on a page no extension may reach', () => {
    const el = document.createElement('div');
    renderAccessError(el, 'PAGE_RESTRICTED', base);
    expect(el.textContent).toContain('Page non analysable');
    expect(el.querySelector('#open-settings-link')).toBeNull();
  });

  it('keeps the browser message, as text', () => {
    const el = document.createElement('div');
    renderAccessError(el, 'PRIVATE_WINDOW', { ...base, detail: '<b>Missing host permission</b>' });
    expect(el.textContent).toContain('fenêtres privées');
    expect(el.querySelector('details pre')!.textContent).toBe('<b>Missing host permission</b>');
    expect(el.querySelector('b')).toBeNull();
  });
});

describe('isPrivateHost', () => {
  const host = (url: string) => new URL(url).hostname;

  it.each([
    'http://localhost/',
    'http://app.localhost/',
    'http://printer.local/',
    'http://127.0.0.1/',
    'http://10.1.2.3/',
    'http://172.16.0.1/',
    'http://172.31.255.255/',
    'http://192.168.1.1/',
    'http://169.254.169.254/',
    'http://0.0.0.0/',
    'http://3232235777/', // 192.168.1.1, normalised by URL
    'http://[::1]/',
    'http://[fd12:3456::1]/',
    'http://[fe80::1]/',
    'http://[::ffff:192.168.1.1]/',
    'http://[::127.0.0.1]/',
    'http://[fec0::1]/',
    'http://localhost./',
    'http://printer.local./',
    'http://100.64.0.1/',
    'http://198.18.0.1/',
    'http://224.0.0.1/',
  ])('%s is private', (url) => {
    expect(isPrivateHost(host(url))).toBe(true);
  });

  it.each([
    'https://example.com/',
    'http://172.15.0.1/',
    'http://172.32.0.1/',
    'http://8.8.8.8/',
    'http://[2001:db8::1]/',
    'http://[::ffff:8.8.8.8]/',
    'https://localhost.example.com/',
    'https://example.com./',
    'http://100.63.0.1/',
    'http://100.128.0.1/',
  ])('%s is public', (url) => {
    expect(isPrivateHost(host(url))).toBe(false);
  });
});

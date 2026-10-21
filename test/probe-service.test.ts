import { afterEach, describe, expect, it, vi } from 'vitest';
import { probeRoot, REDIRECT_STATUS, wwwVariant } from '@/recovery/probe-service';

function fakeResponse(status: number, body = '', type: ResponseType = 'basic') {
  return {
    type,
    status,
    statusText: '',
    headers: new Headers({ 'content-type': 'text/plain' }),
    text: vi.fn(async () => body),
  };
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('probeRoot', () => {
  it('answers under the keys the overlay reads, without following redirects', async () => {
    const fetchMock = vi.fn(async (url: string, _init: RequestInit) =>
      url.endsWith('/robots.txt') ? fakeResponse(200, 'User-agent: *') : fakeResponse(404),
    );
    vi.stubGlobal('fetch', fetchMock);

    const out = await probeRoot('https://example.test');
    expect(Object.keys(out).sort()).toEqual([
      'oqs-v5:probe404',
      'oqs-v5:robots',
      'oqs-v5:sitemap',
      'oqs-v5:www',
    ]);
    expect(out['oqs-v5:robots']).toMatchObject({ status: 200, data: 'User-agent: *' });
    expect(out['oqs-v5:sitemap']?.status).toBe(404);
    expect(fetchMock.mock.calls.map(([u]) => u)).toContain('https://www.example.test/');
    expect(fetchMock.mock.calls.every(([, i]) => i.redirect === 'manual')).toBe(true);
    expect(fetchMock.mock.calls.every(([, i]) => i.credentials === 'omit')).toBe(true);
  });

  it('counts a redirect as the answer for the www twin only', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => fakeResponse(0, '', 'opaqueredirect')),
    );

    const out = await probeRoot('https://example.test');
    expect(out['oqs-v5:www']?.status).toBe(REDIRECT_STATUS);
    expect(out['oqs-v5:robots']?.status).toBe(0);
    expect(out['oqs-v5:sitemap']?.status).toBe(0);
    expect(out['oqs-v5:probe404']?.status).toBe(0);
  });

  it('gives up on a body that never comes', async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init: RequestInit) => ({
        ...fakeResponse(200),
        text: () =>
          new Promise<string>((_resolve, reject) =>
            init.signal!.addEventListener('abort', () =>
              reject(new DOMException('aborted', 'AbortError')),
            ),
          ),
      })),
    );

    const pending = probeRoot('https://example.test');
    await vi.advanceTimersByTimeAsync(5_000);
    const out = await pending;
    expect(out['oqs-v5:robots']).toMatchObject({ status: 200, data: '' });
  });
});

describe('wwwVariant', () => {
  it.each([
    ['https://example.test', 'https://www.example.test'],
    ['https://www.example.test', 'https://example.test'],
    ['http://localhost:8080', null],
    ['http://127.0.0.1', null],
    ['http://[::1]', null],
  ])('%s → %s', (origin, twin) => {
    expect(wwwVariant(origin)).toBe(twin);
  });
});

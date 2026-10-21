import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchMainDocument, refetchResources } from '@/recovery/refetch-service';

/** A fetch() result with just what refetchOne reads. */
function fakeResponse(headers: Record<string, string>, body = '') {
  return {
    status: 200,
    statusText: 'OK',
    headers: new Headers(headers),
    text: vi.fn(async () => body),
    arrayBuffer: vi.fn(async () => new ArrayBuffer(0)),
  };
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('refetchResources', () => {
  it('gives up on a resource that never answers', async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url: string, init: RequestInit) =>
          new Promise((_resolve, reject) =>
            init.signal!.addEventListener('abort', () =>
              reject(new DOMException('aborted', 'AbortError')),
            ),
          ),
      ),
    );

    const pending = refetchResources([{ uri: 'https://example.test/slow.js', type: 'script' }]);
    await vi.advanceTimersByTimeAsync(10_000);
    const out = await pending;
    expect(out.responses).toEqual({});
  });

  it('does not download an image announced as too large', async () => {
    const res = fakeResponse({ 'content-type': 'image/png', 'content-length': '5000000' });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => res),
    );

    const out = await refetchResources([{ uri: 'https://example.test/big.png', type: 'image' }]);
    expect(res.arrayBuffer).not.toHaveBeenCalled();
    expect(out.responses).toEqual({});
    expect(out.images).toEqual({});
  });

  it('keeps the body of a text resource', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => fakeResponse({ 'content-type': 'text/css' }, 'a{}')),
    );

    const out = await refetchResources([{ uri: 'https://example.test/a.css', type: 'stylesheet' }]);
    expect(out.responses['https://example.test/a.css']?.data).toBe('a{}');
  });

  it('sends cookies to the page origin only, and keeps a public page off the local network', async () => {
    const fetchMock = vi.fn(async (_url: string, _init: RequestInit) =>
      fakeResponse({ 'content-type': 'text/javascript' }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await refetchResources(
      [
        { uri: 'https://example.test/app.js', type: 'script' },
        { uri: 'https://cdn.test/lib.js', type: 'script' },
        { uri: 'http://192.168.1.1/admin.js', type: 'script' },
      ],
      'https://example.test/page',
    );
    const calls = Object.fromEntries(fetchMock.mock.calls.map(([u, i]) => [u, i.credentials]));
    expect(calls).toEqual({
      'https://example.test/app.js': 'include',
      'https://cdn.test/lib.js': 'omit',
    });
  });

  it('never follows a redirect', async () => {
    const fetchMock = vi.fn(async (_url: string, _init: RequestInit) =>
      fakeResponse({ 'content-type': 'text/javascript' }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await refetchResources(
      [
        { uri: 'https://example.test/app.js', type: 'script' },
        { uri: 'https://cdn.test/logo.png', type: 'image' },
      ],
      'https://example.test/page',
    );
    expect(fetchMock.mock.calls.map(([, i]) => i.redirect)).toEqual(['error', 'error']);
  });

  it('lets a local page use local resources', async () => {
    const fetchMock = vi.fn(async (_url: string, _init: RequestInit) =>
      fakeResponse({ 'content-type': 'text/javascript' }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await refetchResources(
      [{ uri: 'http://localhost:8080/app.js', type: 'script' }],
      'http://localhost:8080/',
    );
    expect(fetchMock.mock.calls.map(([u, i]) => [u, i.credentials])).toEqual([
      ['http://localhost:8080/app.js', 'include'],
    ]);
  });
});

describe('fetchMainDocument', () => {
  it("returns the page's headers as the engine's main_frame resource", async () => {
    const res = fakeResponse({
      'Content-Type': 'text/html; charset="UTF-8"',
      'Content-Security-Policy': "default-src 'self'",
    });
    const cancel = vi.fn(async () => {});
    const fetchMock = vi.fn(async (_url: string, _init: RequestInit) => ({
      ...res,
      type: 'basic',
      body: { cancel },
    }));
    vi.stubGlobal('fetch', fetchMock);

    const main = await fetchMainDocument('https://example.test/page');
    expect(main).toMatchObject({
      uri: 'https://example.test/page',
      type: 'main_frame',
      status: 200,
      charset: 'UTF-8',
      headers: { 'content-security-policy': "default-src 'self'" },
    });
    expect(fetchMock.mock.calls[0]![1]).toMatchObject({
      credentials: 'include',
      redirect: 'manual',
    });
    expect(cancel).toHaveBeenCalled(); // headers only: the body is not downloaded
  });

  it('gives nothing for a redirect, or a page that is not http(s)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ...fakeResponse({}), type: 'opaqueredirect', body: null })),
    );
    expect(await fetchMainDocument('https://example.test/old')).toBeNull();
    expect(await fetchMainDocument('file:///home/me/page.html')).toBeNull();
  });
});

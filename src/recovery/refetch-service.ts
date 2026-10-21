// Re-fetches the page's sub-resources (listed by scan-dom.ts) from the BACKGROUND, where
// host_permissions bypass the page's CORS — a content-script fetch cannot. The bodies back the
// page-side XHR, and the bytes give image size and animation. fetch() transparently decompresses,
// so Content-Encoding is not visible here: the engine's compression checks cannot conclude.

import type { RawResponse } from '@/engine/run-in-page';
import { headersFromFetch, headersToRecord } from '@/lib/http-utils';
import { isPrivateHost } from '@/lib/page-access';
import type { ScannedItem } from './scan-dom';

/** One entry of the engine's `sidecar.resources` (the shape the desktop HAR export produced). */
export interface CollectedResource {
  uri: string;
  referrer: string;
  method: string;
  status: number;
  status_text: string;
  date: string | null;
  modified: string | null;
  expires: string | null;
  content_type: string | null;
  charset: string | null;
  size: number;
  headers: Record<string, string>; // lowercased, comma-joined
  type: string; // main_frame (the page itself) / script / stylesheet / image
  fromCache: boolean;
  image_info?: ImageInfo;
}

export interface ImageInfo {
  width: number;
  height: number;
  animated: boolean;
  format: string;
}

export interface RefetchOutput {
  responses: Record<string, RawResponse>;
  images: Record<string, ImageInfo>;
}

const MAX_BYTES = 3_000_000; // skip very large bodies
const CONCURRENCY = 8;
// A resource that never answers must not hold the whole analysis: give up on it, it is then absent.
const FETCH_TIMEOUT_MS = 10_000;

/** Detect animated GIF / APNG / animated WebP from raw bytes (best-effort). */
function detectAnimated(bytes: Uint8Array, format: string): boolean {
  const ascii = (i: number, s: string) => {
    for (let k = 0; k < s.length; k++) if (bytes[i + k] !== s.charCodeAt(k)) return false;
    return true;
  };
  if (format === 'gif') {
    // animated if more than one Graphic Control Extension (0x21 0xF9)
    let n = 0;
    for (let i = 0; i + 1 < bytes.length; i++) {
      if (bytes[i] === 0x21 && bytes[i + 1] === 0xf9 && ++n > 1) return true;
    }
    return false;
  }
  if (format === 'png') {
    for (let i = 8; i + 4 < bytes.length && i < 4096; i++) if (ascii(i, 'acTL')) return true;
    return false;
  }
  if (format === 'webp') {
    for (let i = 12; i + 4 < bytes.length && i < 4096; i++) if (ascii(i, 'ANIM')) return true;
    return false;
  }
  return false;
}

function formatFromContentType(ct: string): string {
  if (ct.includes('gif')) return 'gif';
  if (ct.includes('png')) return 'png';
  if (ct.includes('webp')) return 'webp';
  if (ct.includes('jpeg') || ct.includes('jpg')) return 'jpeg';
  if (ct.includes('svg')) return 'svg';
  return ct.split('/')[1] ?? '';
}

async function refetchOne(
  item: ScannedItem,
  out: RefetchOutput,
  credentials: RequestCredentials,
): Promise<void> {
  // The timer covers the body too: a server can send headers and then stall.
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    // No redirects: fetchPolicy judged this URL, not wherever it redirects to. A followed redirect
    // could reach the local network, or carry the page's cookies to another site.
    const res = await fetch(item.uri, {
      credentials,
      redirect: 'error',
      signal: ctrl.signal,
    });
    const ct = res.headers.get('content-type') ?? '';
    const len = Number(res.headers.get('content-length') ?? 0);
    const response = (data: string): RawResponse => ({
      status: res.status,
      statusText: res.statusText,
      headers: headersFromFetch(res.headers),
      content_type: ct || null,
      data,
    });

    if (item.type === 'image') {
      if (len > MAX_BYTES) return; // known too large: don't download it
      const buf = await res.arrayBuffer();
      if (buf.byteLength > MAX_BYTES) return;
      const bytes = new Uint8Array(buf);
      const format = formatFromContentType(ct);
      let width = 0;
      let height = 0;
      try {
        const bmp = await createImageBitmap(new Blob([buf], { type: ct || 'image/*' }));
        width = bmp.width;
        height = bmp.height;
        bmp.close?.();
      } catch {
        /* undecodable */
      }
      out.images[item.uri] = { width, height, animated: detectAnimated(bytes, format), format };
      out.responses[item.uri] = response('');
      return;
    }

    // text resources (script / stylesheet): the body, unless it is too large to be worth it
    out.responses[item.uri] = response(
      len > MAX_BYTES ? '' : (await res.text()).slice(0, MAX_BYTES),
    );
  } catch {
    // network error / blocked / timed out — leave it absent; XHR.get resolves empty for misses.
  } finally {
    clearTimeout(timer);
  }
}

/**
 * What the page may get the extension to fetch. The URLs come from the page's own markup, and the
 * background fetches them with the host permission, past CORS:
 *  - the user's cookies go only to the page's own origin, the one being analysed;
 *  - a public page cannot reach this machine or the local network (a local page still can).
 */
function fetchPolicy(pageUrl: string | undefined) {
  let pageOrigin = '';
  let pageIsLocal = true; // file: pages, or no URL at all
  try {
    const page = new URL(pageUrl ?? '');
    pageOrigin = page.origin;
    pageIsLocal = !page.hostname || isPrivateHost(page.hostname);
  } catch {
    /* no usable page URL: no cookies anywhere, local resources allowed */
  }
  return (uri: string): RequestCredentials | null => {
    let target: URL;
    try {
      target = new URL(uri);
    } catch {
      return null;
    }
    if (!pageIsLocal && isPrivateHost(target.hostname)) return null;
    return target.origin === pageOrigin ? 'include' : 'omit';
  };
}

export async function refetchResources(
  items: ScannedItem[],
  pageUrl?: string,
): Promise<RefetchOutput> {
  const out: RefetchOutput = { responses: {}, images: {} };
  const policy = fetchPolicy(pageUrl);
  // de-dup by uri
  const seen = new Set<string>();
  const queue = items.filter((i) => i.uri && !seen.has(i.uri) && (seen.add(i.uri), true));

  let cursor = 0;
  const workers = Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
    while (cursor < queue.length) {
      const item = queue[cursor++]!;
      const credentials = policy(item.uri);
      if (credentials) await refetchOne(item, out, credentials);
    }
  });
  await Promise.all(workers);
  return out;
}

/**
 * The inspected page's own response, for the rules that read its headers (CSP, X-Frame-Options,
 * charset…): the page is fetched again from the background, with the cookies of its own origin, as
 * the browser loaded it. Only the headers are kept; the body is cancelled once they arrive. A
 * redirect is not followed (the rules then answer "i"), nor is anything but http(s).
 */
export async function fetchMainDocument(pageUrl: string): Promise<CollectedResource | null> {
  if (!/^https?:/i.test(pageUrl)) return null;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(pageUrl, {
      credentials: 'include',
      redirect: 'manual',
      signal: ctrl.signal,
    });
    void res.body?.cancel().catch(() => {});
    if (res.type === 'opaqueredirect') return null;
    const headers = headersToRecord(headersFromFetch(res.headers));
    const ct = headers['content-type'] ?? null;
    return {
      uri: pageUrl,
      referrer: '',
      method: 'GET',
      status: res.status,
      status_text: res.statusText,
      date: headers['date'] ?? null,
      modified: headers['last-modified'] ?? null,
      expires: headers['expires'] ?? null,
      content_type: ct,
      charset: /charset=\s*"?([^";]+)/i.exec(ct ?? '')?.[1] ?? null,
      size: Number(headers['content-length'] ?? 0),
      headers,
      type: 'main_frame',
      fromCache: false,
    };
  } catch {
    return null; // network error / timed out: the header rules answer "i"
  } finally {
    clearTimeout(timer);
  }
}

/** The engine's resource entries for what was re-fetched (headers as seen by fetch()). */
export function toResources(items: ScannedItem[], out: RefetchOutput): CollectedResource[] {
  const list: CollectedResource[] = [];
  for (const item of items) {
    const resp = out.responses[item.uri];
    if (!resp) continue;
    const headers = headersToRecord(resp.headers);
    list.push({
      uri: item.uri,
      referrer: '',
      method: 'GET',
      status: resp.status,
      status_text: resp.statusText,
      date: headers['date'] ?? null,
      modified: headers['last-modified'] ?? null,
      expires: headers['expires'] ?? null,
      content_type: resp.content_type,
      charset: null,
      size: Number(headers['content-length'] ?? resp.data.length),
      headers,
      type: item.type,
      fromCache: false,
      image_info: out.images[item.uri],
    });
  }
  return list;
}

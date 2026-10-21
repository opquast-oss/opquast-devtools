// Best-effort BACKGROUND fetches of a few site-root artefacts the engine cannot otherwise see:
// robots.txt, sitemap.xml, a 404 probe, and the www/non-www variant. Runs in the background,
// where host_permissions bypass the page's CORS.
//
// Results are exposed in the `responses` map under LOGICAL keys ("oqs-v5:*"), which the page-side
// XHR shim serves to the matching oqs-v5 functions (see data/engine-overlay/oqs-tests-overlay.js).
// Every fetch is best-effort: on failure the entry is status 0, and the rule falls back to "i"
// (undetermined) rather than a wrong verdict.

import type { RawResponse } from '@/engine/run-in-page';

const TIMEOUT_MS = 5000;
const MAX_BYTES = 200_000;

const EMPTY: RawResponse = { status: 0, statusText: '', headers: [], content_type: null, data: '' };

// Status recorded for a redirect that was not followed (fetch hides the real 3xx code).
export const REDIRECT_STATUS = 302;

/**
 * Fetch one probe. Redirects are never followed: the site could otherwise send the probe to the
 * local network. With `redirectIsAnswer`, a redirect is the answer (REDIRECT_STATUS, no body):
 * the www twin redirecting to the canonical host is what the rule hopes for. Otherwise it is
 * status 0, and the rule says "i" rather than guess.
 */
async function grab(url: string, redirectIsAnswer = false): Promise<RawResponse> {
  // The timer covers the body too: a server can send headers and then stall.
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { redirect: 'manual', signal: ctrl.signal, credentials: 'omit' });
    if (res.type === 'opaqueredirect') {
      return redirectIsAnswer ? { ...EMPTY, status: REDIRECT_STATUS } : { ...EMPTY };
    }
    let data = '';
    const len = Number(res.headers.get('content-length') ?? 0);
    if (len <= MAX_BYTES) {
      try {
        data = (await res.text()).slice(0, MAX_BYTES);
      } catch {
        /* body unreadable or timed out — keep status only */
      }
    }
    return {
      status: res.status,
      statusText: res.statusText,
      headers: [],
      content_type: res.headers.get('content-type'),
      data,
    };
  } catch {
    return { ...EMPTY };
  } finally {
    clearTimeout(timer);
  }
}

/** The www / non-www twin of `origin`; null for an IP address or a single-label host. */
export function wwwVariant(origin: string): string | null {
  try {
    const u = new URL(origin);
    const host = u.hostname;
    if (!host.includes('.') || host.startsWith('[') || /^[\d.]+$/.test(host)) return null;
    u.hostname = host.startsWith('www.') ? host.slice(4) : `www.${host}`;
    return u.origin;
  } catch {
    return null;
  }
}

// A path no site should serve, to see how the site answers a missing page.
const RANDOM_404 = 'oqs-v5-404-probe-a7Q2z9k';

/** Fetch the root artefacts for `origin`; returns a responses-map slice keyed by oqs-v5:* logical keys. */
export async function probeRoot(origin: string): Promise<Record<string, RawResponse>> {
  const variant = wwwVariant(origin);
  const [robots, sitemap, probe404, www] = await Promise.all([
    grab(`${origin}/robots.txt`),
    grab(`${origin}/sitemap.xml`),
    // Not a redirect answer: the 404 rules also read the error page's body, which a redirect lacks.
    grab(`${origin}/${RANDOM_404}`),
    variant ? grab(`${variant}/`, true) : { ...EMPTY },
  ]);
  return {
    'oqs-v5:robots': robots,
    'oqs-v5:sitemap': sitemap,
    'oqs-v5:probe404': probe404,
    'oqs-v5:www': www,
  };
}

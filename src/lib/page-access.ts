// Why the engine could not reach the inspected page. Browsers answer every refusal with the same
// "Missing host permission for the tab" (Firefox) / "Cannot access contents of …" (Chrome), whether
// the host permission is missing, the page is one no extension may touch (about:, the PDF viewer,
// addons.mozilla.org…), or the tab sits in a private window the extension is not allowed into.
// Only the first one is fixed by granting a permission, so the panel must not ask for it blindly.

export type AccessFailure = 'PERMISSION_DENIED' | 'PRIVATE_WINDOW' | 'PAGE_RESTRICTED';

export const ACCESS_FAILURES: readonly AccessFailure[] = [
  'PERMISSION_DENIED',
  'PRIVATE_WINDOW',
  'PAGE_RESTRICTED',
];

export function isAccessFailure(code: unknown): code is AccessFailure {
  return ACCESS_FAILURES.includes(code as AccessFailure);
}

/** The browser refused the extension access to the tab (cause still unknown at this point). */
export function isAccessError(message: string): boolean {
  const m = message.toLowerCase();
  return m.includes('host permission') || m.includes('cannot access');
}

/** Schemes the engine can run on, given the host permission. Everything else is browser-internal. */
export function isAnalysableUrl(url: string | undefined): boolean {
  return !!url && /^(https?|file):/i.test(url);
}

/** The host-permission pattern that covers `url` (file: URLs have an opaque "null" origin). */
export function originPattern(url: string): string {
  return /^file:/i.test(url) ? 'file:///*' : `${new URL(url).origin}/*`;
}

export interface AccessFacts {
  /** The inspected page's URL, when known (Firefox hides tab.url without the host permission). */
  url?: string;
  incognito: boolean;
  incognitoAllowed: boolean;
  /** Whether the host permission covers the page's origin; null when it could not be checked. */
  originGranted: boolean | null;
}

export function classifyAccessFailure(f: AccessFacts): AccessFailure {
  if (f.incognito && !f.incognitoAllowed) return 'PRIVATE_WINDOW';
  if (f.url && !isAnalysableUrl(f.url)) return 'PAGE_RESTRICTED';
  // Permission held and still refused: a page the browser protects from every extension.
  if (f.originGranted === true) return 'PAGE_RESTRICTED';
  return 'PERMISSION_DENIED';
}

/**
 * Whether the tab holds the page the panel asked about, so the engine may run. A tab still loading
 * — or, in Firefox, a new tab still on the initial about:blank it already reports "complete" —
 * makes Firefox refuse the injection ("Missing host permission") and lets Chrome analyse that
 * empty document as if it were the page. `expectedUrl` is the panel's view of the URL; a
 * different final URL (redirect) is fine, about:blank in its place is not. Without the host
 * permission tab.url is hidden and only the status can be trusted — unless `urlVisible` says the
 * permission covers the expected page: a hidden URL is then Firefox's initial about:blank, which
 * it reports "complete" with no URL, and the page is not there yet.
 */
export function isTabReady(
  tab: { status?: string; url?: string },
  expectedUrl?: string,
  urlVisible = false,
): boolean {
  if (tab.status !== 'complete') return false;
  if (!tab.url) return !urlVisible;
  if (!expectedUrl) return true;
  return !(tab.url === 'about:blank' && expectedUrl !== 'about:blank');
}

/**
 * Whether `hostname` (as `URL.hostname` gives it) names this machine or the local network:
 * localhost, mDNS `.local`, the private / loopback / link-local / shared / reserved IPv4 ranges
 * and their IPv6 counterparts. A public page must not get the extension to fetch these with its
 * host permission. Only the name is judged: an extension cannot see what a DNS name resolves to.
 */
export function isPrivateHost(hostname: string): boolean {
  // "localhost." is the same host as "localhost": drop the root dot before comparing.
  const h = hostname
    .toLowerCase()
    .replace(/^\[|\]$/g, '')
    .replace(/\.+$/, '');
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local')) return true;
  const v4 = /^(\d+)\.(\d+)\.\d+\.\d+$/.exec(h);
  if (v4) return isPrivateV4(Number(v4[1]), Number(v4[2]));
  if (!h.includes(':')) return false;
  // IPv4-mapped / IPv4-compatible IPv6: URL serialises [::ffff:192.168.1.1] as ::ffff:c0a8:101
  // and [::127.0.0.1] as ::7f00:1.
  const embedded = /^::(?:ffff:)?([0-9a-f]{1,4}):[0-9a-f]{1,4}$/.exec(h);
  if (embedded) {
    const high = parseInt(embedded[1]!, 16);
    return isPrivateV4(high >> 8, high & 0xff);
  }
  // loopback, unspecified, unique local (fc00::/7), link-local (fe80::/10), site-local (fec0::/10)
  return h === '::1' || h === '::' || /^f[cd]/.test(h) || /^fe[89a-f]/.test(h);
}

function isPrivateV4(a: number, b: number): boolean {
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) || // shared address space (CGNAT)
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) || // benchmarking
    a >= 224 // multicast and reserved
  );
}

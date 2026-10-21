/**
 * In-page engine runner — injected via chrome.scripting.executeScript.
 *
 * **SERIALIZATION CONSTRAINT**: This function is serialized via toString() and executed
 * in the inspected page's ISOLATED world. It MUST be fully self-contained and may only
 * reference its `payload` argument and page/world globals — never module-scope symbols.
 *
 * The shims below (Q, XHR, buildEvents, etc.) intentionally duplicate the logic in
 * @opquast/test-runner's context.ts and loader.ts. This duplication is unavoidable due
 * to the serialization constraint. When modifying this file, ensure parity with:
 *   - packages/opquast-test-runner/src/context.ts (Q shim, XHR shim)
 *   - packages/opquast-test-runner/src/loader.ts (buildEventsFromDom, buildSyntheticResource)
 *
 * The engine libs (jquery, oqs-utils, cssParser, oqs-validator, oqs-tests) are injected
 * as files into the same world BEFORE this function runs. It then reconstructs the
 * `sidecar` inputs and calls: analyze(criteria).then(synthesize_results)
 */

/**
 * HTTP response data for XHR shim.
 * Equivalent to XhrResponseData in @opquast/test-runner/context.
 */
export interface RawResponse {
  status: number;
  statusText: string;
  headers: { name: string; value: string }[];
  content_type: string | null;
  data: string; // body text ('' for binary)
}

export interface RunPayload {
  rules: Record<string, unknown>;
  rulesets: Record<string, unknown>;
  options?: Record<string, unknown>;
  /** Re-fetched HTTP resources. When omitted, a synthetic main-doc resource is used. */
  resources?: unknown[] | null;
  /** url -> re-fetched body, backing the page-side XHR. */
  responses?: Record<string, RawResponse> | null;
  /**
   * sidecar.events, rebuilt from the DOM:
   *  - 'inline' : the inline on* handlers (addEventListener calls cannot be seen from here)
   *  - 'none'   : empty (default)
   */
  events?: 'inline' | 'none';
}

export interface EngineResult {
  results: unknown;
  pageInfo: unknown;
  resources: unknown[];
  _serializeWarning?: string;
}

export function runEngineInPage(payload: RunPayload): Promise<EngineResult> {
  const g = globalThis as any;
  const $ = g.jQuery;

  // --- Q: the subset of the Mozilla SDK promise API the engine relies on ---
  const makeDefer = () => {
    let resolve!: (v?: unknown) => void;
    let reject!: (e?: unknown) => void;
    const promise = new Promise((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve, reject };
  };
  g.Q = {
    defer: makeDefer,
    resolve: (v: unknown) => Promise.resolve(v),
    reject: (e: unknown) => Promise.reject(e),
    promised:
      (_Ctor: unknown) =>
      (...ps: unknown[]) =>
        Promise.all(ps),
  };

  // console.exception() is used in one catch path and does not exist in Chrome/Firefox.
  if (!g.console) g.console = {};
  if (typeof g.console.exception !== 'function') {
    g.console.exception = (e: unknown) =>
      typeof g.console.error === 'function' ? g.console.error(e) : undefined;
  }

  // --- XHR: backed by background re-fetched bodies, else resolves empty ---
  const responses: Record<string, RawResponse> = payload.responses || {};
  const makeResponse = (r?: RawResponse) => {
    const headers = r?.headers || [];
    return {
      status: r?.status ?? 0,
      statusText: r?.statusText ?? '',
      headers,
      content_type: r?.content_type ?? null,
      data: r?.data ?? '',
      xml: null,
      getHeader(name: string) {
        const lc = name.toLowerCase();
        const vals = headers.filter((h) => h.name.toLowerCase() === lc).map((h) => h.value);
        return vals.length ? vals.join(',') : null;
      },
    };
  };
  g.XHR = {
    get: (url: string) => Promise.resolve(makeResponse(responses[url] || responses[String(url)])),
    query: (url: string) => Promise.resolve(makeResponse(responses[url] || responses[String(url)])),
  };

  // --- $.ajax shim: a couple of CSS-quality rules (cssWithCarriageReturn / cssWithRedundantSpaces)
  // read stylesheet text with a *direct* $.ajax(href) instead of going through XHR.get. From a
  // content script that request carries the page's origin, so a cross-origin stylesheet served
  // without Access-Control-Allow-Origin (e.g. a CDN) is CORS-blocked. Serve those from the
  // background-refetched bodies we already hold in `responses`. Any other URL fails: a request
  // from here would carry none of the background's checks (local network, cookies, time limit),
  // and the extension contacts no third-party service (PRIVACY.md). No shipped rule needs one.
  if ($ && typeof $.ajax === 'function') {
    $.ajax = function (url: unknown) {
      const raw = typeof url === 'string' ? url : (url as { url?: string })?.url;
      let abs = raw;
      try {
        if (raw) abs = new URL(raw, g.document.baseURI).href;
      } catch {
        /* not a resolvable URL — leave raw */
      }
      const hit = (raw && responses[raw]) || (abs && responses[abs]);
      if (hit) {
        // Mimic a successful text response so .done(data, textStatus, jqXHR) fires with the body.
        return $.Deferred()
          .resolve(hit.data, 'success', { status: hit.status || 200, responseText: hit.data })
          .promise();
      }
      return $.Deferred()
        .reject({ status: 0, responseText: '' }, 'error', 'not re-fetched')
        .promise();
    };
  }

  // No DNS lookup from an extension: resolve to null so countryServer no-ops cleanly.
  g.dnsLookup = () => Promise.resolve(null);

  const doc: Document = g.document;

  // Reconstruct sidecar.events ([{ node, events: [{ type }] }]) from the inline on* attributes.
  // DOM nodes are shared across worlds, so the engine's _getDetails(node) gets a real element.
  const buildEvents = (mode: 'inline' | 'none'): unknown[] => {
    if (mode === 'none') return [];
    const byNode = new Map<Element, Set<string>>();
    const add = (el: Element, type: string) => {
      let set = byNode.get(el);
      if (!set) byNode.set(el, (set = new Set()));
      set.add(type);
    };
    doc.querySelectorAll('*').forEach((el) => {
      for (const a of Array.from(el.attributes)) {
        const m = /^on(\w+)$/.exec(a.name);
        if (m) add(el, m[1]!);
      }
    });
    return [...byNode.entries()].map(([node, types]) => ({
      node,
      events: [...types].map((type) => ({ type })),
    }));
  };
  const events = buildEvents(payload.events ?? 'none');
  g.extractEvents = () => events;

  // --- pageInfo + resources (reconstructed if provided, else synthetic main doc) ---
  const pageInfo = $.extractPageInfo();
  const plainText = new g.XMLSerializer().serializeToString(doc);
  const resources =
    payload.resources && payload.resources.length
      ? payload.resources
      : [
          {
            date: doc.lastModified,
            modified: doc.lastModified,
            expires: null,
            content_type: doc.contentType,
            charset: doc.characterSet,
            size: plainText.length,
            headers: {},
            uri: g.location.href,
            referrer: '',
            method: 'GET',
            status: 200,
            status_text: '200 OK',
          },
        ];

  // --- sidecar + engine globals (mirrors frame-script run) ---
  g.sidecar = { resources, events, pageInfo, plainText };
  const runOptions = payload.options || {};
  for (const k in runOptions) g[k] = runOptions[k];
  g.tests = payload.rules;
  g.criteria = payload.rulesets;

  return g.analyze(g.criteria).then((results: unknown) => {
    const out = g.synthesize_results(results);
    // The results must cross back to the background; page info and resources are extras that are
    // dropped (with a warning) if they cannot be serialised.
    const serialized = JSON.parse(JSON.stringify(out));
    try {
      return {
        results: serialized,
        pageInfo: JSON.parse(JSON.stringify(pageInfo)),
        resources: JSON.parse(JSON.stringify(resources)),
      };
    } catch (e) {
      return {
        results: serialized,
        pageInfo: {},
        resources: [],
        _serializeWarning: String(e),
      };
    }
  });
}

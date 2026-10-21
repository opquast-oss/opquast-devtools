// Test-only stand-in for the DevTools APIs, injected into the e2e copy of panel.html by prepare.mjs
// (never shipped). Firefox cannot automate a DevTools panel, so the e2e harness opens panel.html in
// a regular tab instead; this script gives it the three things DevTools would have provided:
//
//   devtools.inspectedWindow.tabId   the tab under inspection, opened here from ?inspect=<url>
//   devtools.inspectedWindow.eval    run in that tab's MAIN world, answering [result, exceptionInfo]
//   devtools.network.onNavigated     inert (the harness opens a fresh panel per page)
//
// Everything else — background, engine, storage, rendering — is the real extension.
(() => {
  const api = globalThis.browser ?? globalThis.chrome;
  const firefox = typeof api.runtime.getBrowserInfo === 'function';
  const params = new URLSearchParams(location.search);
  const target = params.get('inspect') ?? 'about:blank';
  // ?early: answer eval() as soon as the tab exists, as DevTools does when the panel opens on a
  // page that is still loading — the analysis then starts before the page is there.
  const early = params.has('early');
  let tabId = -1;

  // Loaded = on the target URL and complete. Firefox first reports the new tab's initial about:blank
  // as "complete": stopping there ran the engine on about:blank or on a half-loaded page. Without
  // the host permission the URL is hidden, so then settle for "complete" after a grace period.
  const settled = async (id) => {
    const start = Date.now();
    while (Date.now() - start < 10000) {
      const t = await api.tabs.get(id);
      const urlKnown = typeof t.url === 'string' && t.url !== '';
      if (t.status === 'complete' && (urlKnown ? t.url === target : Date.now() - start > 1500)) {
        return;
      }
      await new Promise((r) => setTimeout(r, 100));
    }
  };

  // Background tab, so the panel stays the one on screen (and the one screenshotted).
  const ready = api.tabs.create({ url: target, active: false }).then((tab) => {
    tabId = tab.id;
    return early ? undefined : settled(tab.id);
  });

  // A real DevTools panel does not open the page it inspects; this one does, so it cleans up too.
  addEventListener('pagehide', () => tabId >= 0 && api.tabs.remove(tabId).catch(() => {}));

  function evaluate(expr, options, callback) {
    const cb = typeof options === 'function' ? options : callback;
    const answer = ready.then(() => {
      // DevTools reads the URL of any page, about:blank included; scripting cannot.
      if (expr === 'location.href') return [target, undefined];
      return api.scripting
        .executeScript({
          target: { tabId },
          world: 'MAIN',
          func: (source) => {
            try {
              return { value: (0, eval)(source) };
            } catch (e) {
              return { exception: String(e) };
            }
          },
          args: [expr],
        })
        .then(
          (res) => {
            const out = res[0]?.result ?? {};
            return 'exception' in out
              ? [undefined, { isException: true, value: out.exception }]
              : [out.value, undefined];
          },
          (e) => [undefined, { isError: true, code: String(e) }],
        );
    });
    // Each browser's own shape: Firefox returns a Promise of [result, exceptionInfo]; Chrome
    // returns null and answers through the callback only. Faking Firefox's shape in Chrome hid that
    // the panel awaited a value Chrome never gives.
    if (cb) answer.then(([value, info]) => cb(value, info));
    return firefox ? answer : null;
  }

  const inert = { addListener() {}, removeListener() {}, hasListener: () => false };
  const devtools = {
    inspectedWindow: {
      get tabId() {
        return tabId;
      },
      eval: evaluate,
    },
    network: { onNavigated: inert },
    panels: { create() {} },
  };
  for (const ns of [globalThis.browser, globalThis.chrome]) if (ns) ns.devtools = devtools;
})();

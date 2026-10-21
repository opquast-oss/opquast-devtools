// The real Opquast panel inside real Chrome DevTools, headless. Complements the simulated panel
// (devtools-stub.js), which can only imitate the DevTools APIs — and once imitated Firefox's
// inspectedWindow.eval in Chrome, hiding that the panel never got the page URL there.
//
// Chrome is started with --auto-open-devtools-for-tabs and a CDP port. Each new tab then gets a
// DevTools front (a devtools:// page target); its extension iframes carry it as parentId. The
// Opquast tab is selected through the front's own UI module, which creates the panel iframe.

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright';

function freePort() {
  return new Promise((resolve) => {
    const srv = createServer().listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

/** Minimal CDP client over a target's WebSocket. */
async function connect(wsUrl) {
  const ws = new WebSocket(wsUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', reject, { once: true });
  });
  let seq = 0;
  const pending = new Map();
  ws.addEventListener('message', (m) => {
    const msg = JSON.parse(m.data);
    pending.get(msg.id)?.(msg);
    pending.delete(msg.id);
  });
  const send = (method, params = {}) =>
    new Promise((resolve) => {
      pending.set(++seq, resolve);
      ws.send(JSON.stringify({ id: seq, method, params }));
    });
  return {
    send,
    /** Evaluate a function source in the target; returns its (awaited, JSON) value. */
    async eval(fn, arg) {
      const expression = `(${fn})(${JSON.stringify(arg ?? null)})`;
      const r = await send('Runtime.evaluate', {
        expression,
        awaitPromise: true,
        returnByValue: true,
      });
      if (r.result?.exceptionDetails) {
        throw new Error(r.result.exceptionDetails.exception?.description ?? 'evaluation failed');
      }
      return r.result?.result?.value;
    },
    close: () => ws.close(),
  };
}

export async function launchChromeDevtools(extDir) {
  const port = await freePort();
  const profile = mkdtempSync(join(tmpdir(), 'oqs-e2e-devtools-'));
  const ctx = await chromium.launchPersistentContext(profile, {
    channel: 'chromium',
    headless: true,
    viewport: { width: 1280, height: 800 },
    args: [
      `--disable-extensions-except=${extDir}`,
      `--load-extension=${extDir}`,
      '--no-sandbox',
      `--remote-debugging-port=${port}`,
      '--auto-open-devtools-for-tabs',
    ],
  });
  const targets = async () => (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  const fronts = async () => (await targets()).filter((t) => t.url.startsWith('devtools://'));

  return {
    /** Open `url` in a new tab and return its real Opquast panel. */
    async inspect(url) {
      const before = new Set((await fronts()).map((t) => t.id));
      const page = await ctx.newPage();
      await page.goto(url).catch(() => {}); // about:blank and friends: nothing to wait for

      let front;
      for (let i = 0; i < 40 && !front; i++) {
        front = (await fronts()).find((t) => !before.has(t.id));
        if (!front) await new Promise((r) => setTimeout(r, 250));
      }
      if (!front) throw new Error(`no DevTools opened for ${url}`);

      // Select the Opquast tab: that is what loads panel.html.
      const ui = await connect(front.webSocketDebuggerUrl);
      let panelTarget;
      for (let i = 0; i < 80 && !panelTarget; i++) {
        // The front throws until it has finished booting: keep trying.
        const shown = await ui
          .eval(async () => {
            const UI = await import('./ui/legacy/legacy.js');
            const view = UI.InspectorView.InspectorView.instance();
            const id = view.tabbedPane.tabIds().find((t) => t.endsWith('Opquast'));
            if (id) await view.showPanel(id);
            return Boolean(id);
          })
          .catch(() => false);
        if (shown) {
          panelTarget = (await targets()).find(
            (t) => t.parentId === front.id && t.url.includes('/panel.html'),
          );
        }
        if (!panelTarget) await new Promise((r) => setTimeout(r, 250));
      }
      if (!panelTarget) throw new Error(`no Opquast tab in the DevTools of ${url}`);
      const panel = await connect(panelTarget.webSocketDebuggerUrl);

      return {
        page,
        eval: (fn, arg) => panel.eval(fn, arg),
        /** The whole DevTools window, Opquast panel shown. */
        async screenshot(path) {
          const shot = await ui.send('Page.captureScreenshot', { format: 'png' });
          writeFileSync(path, Buffer.from(shot.result.data, 'base64'));
        },
        async close() {
          panel.close();
          ui.close();
          await page.close();
        },
      };
    },
    async close() {
      await ctx.close();
      rmSync(profile, { recursive: true, force: true });
    },
  };
}

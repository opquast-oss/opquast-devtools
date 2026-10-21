// Test helper for panel view modules (happy-dom). Mounts the real panel markup so context.ts's `els`
// resolve, stubs the background port (the fake browser doesn't implement runtime.connect), then
// re-imports the panel modules with a fresh module graph so `state`/`els` start clean per test.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { vi } from 'vitest';

function panelBody(): string {
  const html = readFileSync(join(process.cwd(), 'src/entrypoints/panel/index.html'), 'utf8');
  return html
    .replace(/[\s\S]*<body[^>]*>/, '')
    .replace(/<\/body>[\s\S]*/, '')
    .replace(/<script[\s\S]*?<\/script>/g, ''); // drop the module script tag (happy-dom can't load it)
}

/** What the panel did with its port: the messages it sent and the handler it registered. */
export const portLog = {
  sent: [] as Record<string, unknown>[],
  listener: null as ((msg: unknown) => void) | null,
  /** Deliver a background message to the panel, as the real port would. */
  deliver(msg: unknown) {
    if (!this.listener) throw new Error('the panel registered no port listener');
    this.listener(msg);
  },
};

function fakePort() {
  return {
    onMessage: {
      addListener: (cb: (msg: unknown) => void) => {
        portLog.listener = cb;
      },
      removeListener: () => {},
    },
    onDisconnect: { addListener: () => {}, removeListener: () => {} },
    postMessage: (msg: Record<string, unknown>) => {
      portLog.sent.push(msg);
    },
    disconnect: () => {},
  };
}

/** Mount the panel DOM, stub the port, reset modules and return the freshly imported panel context. */
export async function loadPanelContext() {
  document.body.innerHTML = panelBody();
  const b = globalThis as unknown as { browser: { runtime: { connect: () => unknown } } };
  b.browser.runtime.connect = () => fakePort();
  portLog.sent = [];
  portLog.listener = null;
  vi.resetModules();
  return import('@/entrypoints/panel/context');
}

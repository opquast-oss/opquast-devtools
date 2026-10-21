// Chrome driver: Playwright's Chromium with the extension loaded unpacked, new headless mode.

import { chromium } from 'playwright';

const VIEWPORT = { width: 1280, height: 800 };

export async function launchChrome(extDir) {
  const ctx = await chromium.launchPersistentContext('', {
    channel: 'chromium', // new headless: the only headless mode that loads extensions
    headless: true,
    viewport: VIEWPORT,
    args: [`--disable-extensions-except=${extDir}`, `--load-extension=${extDir}`, '--no-sandbox'],
  });
  const sw = ctx.serviceWorkers()[0] ?? (await ctx.waitForEvent('serviceworker'));
  const id = new URL(sw.url()).host;
  const errors = [];

  return {
    name: 'chrome',
    errors,
    extUrl: (path) => `chrome-extension://${id}/${path}`,
    async open(url) {
      const page = await ctx.newPage();
      page.on('pageerror', (e) => errors.push(`${page.url()}: ${e.message}`));
      await page.goto(url);
      return {
        eval: (fn, arg) => page.evaluate(fn, arg),
        // Headless Chromium now and then refuses to capture a tab that is not in front.
        async screenshot(path) {
          for (let attempt = 1; ; attempt++) {
            try {
              await page.bringToFront();
              return await page.screenshot({ path });
            } catch (e) {
              if (attempt >= 3) throw e;
              await page.waitForTimeout(500);
            }
          }
        },
        close: () => page.close(),
      };
    },
    close: () => ctx.close(),
  };
}

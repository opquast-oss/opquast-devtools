// The e2e scenarios, written once for both drivers (chrome.mjs / firefox.mjs). Each one opens its
// own tabs and closes them; a failure in one does not stop the next. Panel and options texts are
// checked against src/lib/ui-strings.ts, not copied here.

import { t } from '../../src/lib/ui-strings.ts';
import { launchChromeDevtools } from './devtools-chrome.mjs';

const S = (key) => t('fr', key);
const PANEL_WAIT_MS = 90_000; // past the panel's own 30 s analysis timeout, V5 included

// ---- page-side probes (serialized into the page: no closure over this module) ----------------

function panelState() {
  const $ = (id) => document.getElementById(id);
  return {
    loading: !$('loading-overlay').hidden,
    rows: document.querySelectorAll('#results-body tr[data-id]').length,
    body: $('results-body').textContent.trim(),
    breakdown: $('score-breakdown').textContent.replace(/\s+/g, ' ').trim(),
    score: document.querySelector('#global-score .score-value')?.textContent ?? null,
    accessError: document.querySelector('.permission-error-title')?.textContent ?? null,
    detail: document.querySelector('.permission-error-detail pre')?.textContent ?? null,
    modal: !$('detail-modal').hidden,
    modalText: $('detail-content').textContent.trim().length,
    freshRows: document.querySelector('#results-body tr[data-id]')?.dataset.e2eOld !== 'yes',
  };
}

function click(selector) {
  const el = document.querySelector(selector);
  if (!el) throw new Error(`no element ${selector}`);
  el.click();
  return true;
}

function optionsState() {
  const boxes = [...document.querySelectorAll('#checklists input[type=checkbox]')];
  const access = document.getElementById('hostAccess');
  return {
    checklists: boxes.length,
    enabled: boxes.filter((b) => b.checked).map((b) => b.value),
    slug: document.getElementById('slug').value,
    access: access.textContent,
    accessMissing: access.classList.contains('missing'),
    grantVisible: !document.getElementById('grantHosts').hidden,
  };
}

function storedChecklists() {
  const api = globalThis.browser ?? globalThis.chrome;
  return api.storage.local.get('oqs-prefs').then((s) => s['oqs-prefs']?.enabledChecklists ?? null);
}

// ---- helpers --------------------------------------------------------------------------------

function check(cond, message) {
  if (!cond) throw new Error(message);
}

async function waitFor(tab, probe, until, what, timeout = 15_000) {
  const end = Date.now() + timeout;
  let last;
  for (;;) {
    last = await tab.eval(probe);
    if (until(last)) return last;
    if (Date.now() > end) {
      throw new Error(`timeout waiting for ${what}; last state: ${JSON.stringify(last)}`);
    }
    await new Promise((r) => setTimeout(r, 300));
  }
}

const noRows = (s) =>
  s.accessError
    ? `no result rows: "${s.accessError}" (browser: "${s.detail ?? 'no detail'}")`
    : `no result rows; results table says "${s.body}"`;

const settledPanel = (s) => !s.loading && (s.rows > 0 || s.accessError || !s.body.includes('…'));

async function openPanel(ctx, url, { early = false } = {}) {
  const query = `inspect=${encodeURIComponent(url)}${early ? '&early' : ''}`;
  return ctx.driver.open(ctx.driver.extUrl(`panel.html?${query}`));
}

// ---- scenarios --------------------------------------------------------------------------------

export const SCENARIOS = [
  {
    id: 'install',
    title: 'Install: extension loaded, background reachable',
    async run(ctx) {
      const tab = await ctx.driver.open(ctx.driver.extUrl('options.html'));
      try {
        const info = await tab.eval(() => {
          const api = globalThis.browser ?? globalThis.chrome;
          return { version: api.runtime.getManifest().version, ua: navigator.userAgent };
        });
        check(
          info.version === ctx.version,
          `manifest version ${info.version}, expected ${ctx.version}`,
        );
        const pong = await tab.eval(
          () =>
            new Promise((resolve) => {
              const api = globalThis.browser ?? globalThis.chrome;
              const port = api.runtime.connect({ name: 'oqs-panel' });
              port.onMessage.addListener((m) => {
                if (m?.type === 'PONG') {
                  port.disconnect();
                  resolve(true);
                }
              });
              port.postMessage({ type: 'PING', tabId: 0 });
              setTimeout(() => resolve(false), 5000);
            }),
        );
        check(pong, 'the background did not answer PING');
        return `version ${info.version} — ${info.ua}`;
      } finally {
        await tab.close();
      }
    },
  },
  {
    id: 'config-defaults',
    title: 'Configuration: settings of a fresh profile',
    async run(ctx) {
      const tab = await ctx.driver.open(ctx.driver.extUrl('options.html'));
      try {
        const s = await waitFor(
          tab,
          optionsState,
          (o) => o.checklists > 0 && o.access,
          'the options page',
        );
        await ctx.shot(tab, 'options');
        check(
          JSON.stringify(s.enabled) === JSON.stringify(['901-opquast-basics']),
          `referentials enabled at install: ${s.enabled.join(', ')} (expected Opquast Basics alone)`,
        );
        check(s.slug === '901-opquast-basics', `default checklist: ${s.slug}`);
        check(!s.accessMissing && !s.grantVisible, `site access not granted: "${s.access}"`);
        return `${s.checklists} checklists offered, enabled: ${s.enabled.join(', ')}`;
      } finally {
        await tab.close();
      }
    },
  },
  {
    id: 'inspect-basics',
    title: 'Inspect: analysis, scores, results, detail, relaunch',
    async run(ctx) {
      const tab = await openPanel(ctx, ctx.fixtureUrl);
      try {
        let s = await waitFor(tab, panelState, settledPanel, 'the analysis', PANEL_WAIT_MS);
        await tab.eval(click, '#tab-scores');
        await ctx.shot(tab, 'scores');
        check(s.rows > 0, noRows(s));
        s = await tab.eval(panelState);
        check(s.score && s.score !== '--', `global score: ${s.score}`);
        check(s.breakdown.includes('Opquast Basics'), `scores breakdown: "${s.breakdown}"`);
        ctx.memo.basicsScore = s.score;

        await tab.eval(click, '#tab-results');
        await ctx.shot(tab, 'results');

        await tab.eval(click, '#results-body tr[data-id]');
        s = await waitFor(tab, panelState, (x) => x.modal && x.modalText > 0, 'the detail modal');
        await ctx.shot(tab, 'detail');
        await tab.eval(click, '#close-modal');

        // Relaunch: mark the current rows, then wait for a fresh, complete set.
        const rowsBefore = s.rows;
        await tab.eval(() => {
          for (const tr of document.querySelectorAll('#results-body tr[data-id]')) {
            tr.dataset.e2eOld = 'yes';
          }
        });
        await tab.eval(click, '#relaunch');
        s = await waitFor(
          tab,
          panelState,
          (x) => settledPanel(x) && x.rows > 0 && x.freshRows,
          'the relaunched analysis',
          PANEL_WAIT_MS,
        );
        return `score ${s.score}/10, ${rowsBefore} criteria, relaunch OK (${s.rows} criteria)`;
      } finally {
        await tab.close();
      }
    },
  },
  {
    id: 'config-v5',
    title: 'Configuration : activer V5, le retrouver dans le panneau',
    async run(ctx) {
      const options = await ctx.driver.open(ctx.driver.extUrl('options.html'));
      const both = ['901-opquast-basics', '900-opquast-v5'];
      try {
        await waitFor(options, optionsState, (o) => o.checklists > 0, 'the options page');
        await options.eval(click, '#checklists input[value="900-opquast-v5"]');
        await waitFor(
          options,
          storedChecklists,
          (v) => both.every((slug) => v?.includes(slug)),
          'V5 saved in the preferences',
        );

        const panel = await openPanel(ctx, ctx.fixtureUrl);
        try {
          const s = await waitFor(panel, panelState, settledPanel, 'the analysis', PANEL_WAIT_MS);
          await panel.eval(click, '#tab-scores');
          await ctx.shot(panel, 'scores-v5');
          check(s.rows > 0, noRows(s));
          const { breakdown } = await panel.eval(panelState);
          for (const name of ctx.checklistNames) {
            check(
              breakdown.includes(name),
              `"${name}" missing from the scores breakdown: "${breakdown}"`,
            );
          }
          return `both checklists appear in the scores`;
        } finally {
          await panel.close();
        }
      } finally {
        // Back to the install default, whatever happened.
        const now = await options.eval(storedChecklists).catch(() => null);
        if (now?.includes('900-opquast-v5')) {
          await options.eval(click, '#checklists input[value="900-opquast-v5"]');
        }
        await options.close();
      }
    },
  },
  {
    id: 'inspect-while-loading',
    title: 'Inspect: analysis started while the page loads',
    async run(ctx) {
      const tab = await openPanel(ctx, new URL('/slow', ctx.fixtureUrl).href, { early: true });
      try {
        const s = await waitFor(tab, panelState, settledPanel, 'the analysis', PANEL_WAIT_MS);
        await tab.eval(click, '#tab-scores');
        await ctx.shot(tab, 'scores');
        check(s.rows > 0, noRows(s));
        // Chrome does not fail on a page still loading: it analyses the empty initial document.
        // Only the score gives that away.
        check(
          !ctx.memo.basicsScore || s.score === ctx.memo.basicsScore,
          `score ${s.score}/10 while the loaded page scores ${ctx.memo.basicsScore}/10: the engine ran before the page was there`,
        );
        return `${s.rows} criteria, score ${s.score}/10 (same as the loaded page)`;
      } finally {
        await tab.close();
      }
    },
  },
  {
    id: 'devtools-real',
    title: 'Vrai panneau DevTools : lancement automatique, pages internes',
    only: 'chrome',
    skipReason: 'Firefox does not allow driving its DevTools: stubbed panel only',
    async run(ctx) {
      // The shipped build, without the DevTools stub: the real APIs are what is under test.
      const chrome = await launchChromeDevtools(ctx.shippedDir);
      try {
        const a = await chrome.inspect(ctx.fixtureUrl);
        let s = await waitFor(a, panelState, settledPanel, 'the automatic analysis', PANEL_WAIT_MS);
        await a.eval(click, '#tab-scores');
        await ctx.shot(a, 'autorun');
        check(s.rows > 0, `${noRows(s)} — the analysis did not start on its own`);
        check(
          !ctx.memo.basicsScore || s.score === ctx.memo.basicsScore,
          `score ${s.score}/10, expected ${ctx.memo.basicsScore}/10`,
        );
        const autorun = `automatic analysis: ${s.rows} criteria, ${s.score}/10`;
        await a.close();

        // A tab opened on about:blank: Chrome hides its URL from the panel, and the diagnosis
        // used to fall back to "permission needed".
        const b = await chrome.inspect('about:blank');
        s = await waitFor(b, panelState, settledPanel, 'the panel on about:blank', PANEL_WAIT_MS);
        await ctx.shot(b, 'about-blank');
        check(
          s.accessError === S('errorRestrictedTitle'),
          `about:blank: "${s.accessError ?? s.body}" (browser: "${s.detail ?? 'no detail'}"), expected "${S('errorRestrictedTitle')}"`,
        );
        await b.close();
        return `${autorun}; about:blank: "${s.accessError}"`;
      } finally {
        await chrome.close();
      }
    },
  },
  {
    id: 'access-restricted',
    title: 'Access error: internal page (about:blank)',
    async run(ctx) {
      const tab = await openPanel(ctx, 'about:blank');
      try {
        const s = await waitFor(tab, panelState, settledPanel, 'the panel', PANEL_WAIT_MS);
        check(
          s.accessError === S('errorRestrictedTitle'),
          `Scores tab says "${s.accessError ?? s.breakdown}", expected "${S('errorRestrictedTitle')}"`,
        );
        check(
          s.body === S('runFailedAccess'),
          `Results tab says "${s.body}", expected "${S('runFailedAccess')}"`,
        );
        await ctx.shot(tab, 'restricted-scores');
        await tab.eval(click, '#tab-results');
        await ctx.shot(tab, 'restricted-results');
        return `"${s.accessError}"; Results: "${s.body}"`;
      } finally {
        await tab.close();
      }
    },
  },
  {
    id: 'access-denied',
    title: 'Access error: permission removed',
    only: 'firefox',
    skipReason:
      'Chrome ne permet pas de retirer une permission obligatoire par l’API ; cas couvert par test/page-access.test.ts',
    async run(ctx) {
      const options = await ctx.driver.open(ctx.driver.extUrl('options.html'));
      try {
        const removed = await options.eval(() =>
          globalThis.browser.permissions.remove({ origins: ['<all_urls>'] }),
        );
        check(removed, 'permissions.remove refused');
        await options.eval(() => void setTimeout(() => location.reload(), 0));
        await new Promise((r) => setTimeout(r, 500));
        const o = await waitFor(
          options,
          optionsState,
          (x) => x.accessMissing,
          'the options page to report the missing access',
        );
        check(o.grantVisible, 'the "Allow access to all sites" button is hidden');
        await ctx.shot(options, 'options-no-access');
      } finally {
        await options.close();
      }

      const tab = await openPanel(ctx, ctx.fixtureUrl);
      try {
        const s = await waitFor(tab, panelState, settledPanel, 'the panel', PANEL_WAIT_MS);
        check(
          s.accessError === S('errorPermissionTitle'),
          `Scores tab says "${s.accessError ?? s.breakdown}"; Results tab says "${s.body}"`,
        );
        check(s.detail, 'no "Technical detail" with the browser message');
        check(
          s.body === S('runFailedAccess'),
          `Results tab says "${s.body}", expected "${S('runFailedAccess')}"`,
        );
        await tab.eval(() => {
          const d = document.querySelector('.permission-error-detail');
          if (d) d.open = true;
        });
        await ctx.shot(tab, 'denied-scores');
        await tab.eval(click, '#tab-results');
        await ctx.shot(tab, 'denied-results');
        return `"${s.accessError}"; browser: "${s.detail}"`;
      } finally {
        await tab.close();
      }
    },
  },
];

// Validation of the low-confidence SEMI-AUTO rules against a corpus of REAL pages.
// Reuses the injection of test/v5/run.mjs, against live URLs (CSP neutralised through a route).
// Reports: ERROR (crash on a real DOM), verdict 'na', MISSING-RULESET.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '../..');
const ENGINE = join(ROOT, 'public/engine');
const LIBS = [
  'jquery-3.7.1.min.js',
  'jquery-migrate-3.5.2.min.js',
  'oqs-utils.js',
  'cssParser.js',
  'oqs-validator.js',
  'oqs-tests.js',
  'oqs-tests-overlay.js',
];

// The 24 automated rules with confidence=low (num -> id), from data/v5-automation-triage.json
const RULES = [
  ['28', '54427'],
  ['33', '53942'],
  ['92', '54476'],
  ['97', '54589'],
  ['98', '54551'],
  ['121', '54525'],
  ['123', '54413'],
  ['126', '54437'],
  ['127', '53976'],
  ['142', '54411'],
  ['143', '53972'],
  ['149', '54504'],
  ['154', '54377'],
  ['155', '54005'],
  ['156', '54507'],
  ['157', '54165'],
  ['189', '54173'],
  ['196', '54448'],
  ['237', '54159'],
  ['238', '54415'],
  ['240', '54478'],
  ['241', '54452'],
  ['244', '54533'],
  ['245', '54464'],
];
const CORPUS = [
  'https://example.com/',
  'https://en.wikipedia.org/wiki/Accessibility',
  'https://developer.mozilla.org/en-US/',
  'https://www.gouvernement.fr/',
  'https://www.lemonde.fr/',
  'https://github.com/',
  'https://www.bbc.com/news',
  'https://www.opquast.com/',
];

const libSources = LIBS.map((f) => readFileSync(join(ENGINE, f), 'utf8'));
const rules = JSON.parse(readFileSync(join(ENGINE, 'rules.json'), 'utf8'));
const rulesetsAll = JSON.parse(readFileSync(join(ENGINE, 'rulesets.json'), 'utf8'));
const subset = {};
for (const [, id] of RULES) if (rulesetsAll[id]) subset[id] = rulesetsAll[id];

const browser = await chromium.launch({ args: ['--no-sandbox'] });
const ctx = await browser.newContext({
  userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120 Safari/537.36',
});
// Neutralise the CSP to allow inline injection (the real extension uses an isolated world)
await ctx.route('**/*', async (route) => {
  try {
    const resp = await route.fetch();
    const headers = { ...resp.headers() };
    delete headers['content-security-policy'];
    delete headers['content-security-policy-report-only'];
    await route.fulfill({ response: resp, headers });
  } catch {
    await route.continue();
  }
});

const grid = {}; // id -> { url -> verdict }
for (const [, id] of RULES) grid[id] = {};

for (const url of CORPUS) {
  const page = await ctx.newPage();
  let out;
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 25000 });
    await page.waitForTimeout(1500);
    out = await page.evaluate(
      async ({ libSources, rules, subset }) => {
        for (const src of libSources) {
          const s = document.createElement('script');
          s.textContent = src;
          document.head.appendChild(s);
          s.remove();
        }
        const g = window,
          $ = g.jQuery;
        const md = () => {
          let r, j;
          const p = new Promise((a, b) => {
            r = a;
            j = b;
          });
          return { promise: p, resolve: r, reject: j };
        };
        g.Q = {
          defer: md,
          resolve: (v) => Promise.resolve(v),
          reject: (e) => Promise.reject(e),
          promised:
            () =>
            (...ps) =>
              Promise.all(ps),
        };
        if (typeof g.console.exception !== 'function')
          g.console.exception = (e) => g.console.error(e);
        g.dnsLookup = () => Promise.resolve(null);
        g.XHR = {
          get: () =>
            Promise.resolve({
              status: 0,
              headers: [],
              content_type: null,
              data: '',
              xml: null,
              getHeader: () => null,
            }),
          query: () => Promise.resolve({ status: 0, headers: [], data: '' }),
        };
        g.sidecar = {
          resources: [],
          events: [],
          pageInfo: $.extractPageInfo(),
          plainText: new XMLSerializer().serializeToString(document),
        };
        g.tests = rules;
        const res = {};
        for (const [id, def] of Object.entries(subset)) {
          try {
            g.criteria = { [id]: def };
            const arr = await g.analyze({ [id]: def }).then((r) => g.synthesize_results(r));
            const row = (Array.isArray(arr) ? arr : [])[0] || {};
            res[id] = { result: row.result ?? '?', details: (row.details || []).length };
          } catch (e) {
            res[id] = { result: 'ERR', err: String((e && e.message) || e).slice(0, 60) };
          }
        }
        return res;
      },
      { libSources, rules, subset },
    );
  } catch (e) {
    out = { __nav: 'NAV-ERR: ' + (e.message || e).slice(0, 50) };
  } finally {
    await page.close();
  }

  const label = url.replace(/^https?:\/\//, '').slice(0, 22);
  if (out.__nav) {
    console.log(`\n### ${label} — ${out.__nav}`);
    for (const [, id] of RULES) grid[id][label] = '—';
    continue;
  }
  console.log(`\n### ${label}`);
  for (const [num, id] of RULES) {
    const r = out[id] || { result: 'MISS' };
    const cell =
      r.result === 'ERR' ? `ERR(${r.err})` : `${r.result}${r.details ? '·' + r.details : ''}`;
    grid[id][label] = cell;
    const flag =
      r.result === 'na' || r.result === 'ERR' || r.result === 'MISS' || r.result === '?'
        ? '  ⚠'
        : '';
    console.log(`  #${num} (${id}): ${cell}${flag}`);
  }
}

// Summary of anomalies
console.log('\n\n===== ANOMALIES (na / ERR / MISS / ?) =====');
let anomalies = 0;
for (const [num, id] of RULES) {
  const bad = Object.entries(grid[id]).filter(([, v]) => /^(na|ERR|MISS|\?)/.test(v));
  if (bad.length) {
    anomalies++;
    console.log(`#${num} (${id}): ` + bad.map(([u, v]) => `${u}=${v}`).join('  '));
  }
}
if (!anomalies) console.log('Aucune anomalie (aucun verdict na/ERR/MISS/? sur le corpus).');
await browser.close();

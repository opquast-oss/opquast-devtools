// V5 automation TEST SET runner.
// For every case in test/v5/cases.json, load the real engine (+ overlay) in headless
// Chromium, run ONLY that case's criterion against the case's HTML, and assert the
// engine's verdict equals the expected one. Prints a per-rule pass/fail report.
//
// REQUIRES a browser (Playwright). Runs anywhere one is installed, dev container included:
//   npx playwright install chromium
//   npm run test:v5
//
// This is the durable correctness gate for the V5 automation overlay: as new rules are
// added with fixtures, they are validated here — no manual eyeballing needed.

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

const cases = JSON.parse(readFileSync(join(HERE, 'cases.json'), 'utf8'));
const libSources = LIBS.map((f) => readFileSync(join(ENGINE, f), 'utf8'));
const rules = JSON.parse(readFileSync(join(ENGINE, 'rules.json'), 'utf8'));
const rulesets = JSON.parse(readFileSync(join(ENGINE, 'rulesets.json'), 'utf8'));

const browser = await chromium.launch({ args: ['--no-sandbox'] });
const results = [];
try {
  for (const c of cases) {
    const def = rulesets[c.id];
    if (!def) {
      results.push({ ...c, got: 'MISSING-RULESET', ok: false });
      continue;
    }
    const subset = { [c.id]: def };
    const page = await browser.newPage();
    try {
      await page.setContent(c.html, { waitUntil: 'domcontentloaded' });
      const out = await page.evaluate(
        async ({ libSources, rules, subset, sidecar }) => {
          for (const src of libSources) {
            const s = document.createElement('script');
            s.textContent = src;
            document.head.appendChild(s);
            s.remove(); // side effects (window.* defs) persist; keep the page DOM = fixture only
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
          const responses = (sidecar && sidecar.responses) || {};
          g.XHR = {
            get: (u) =>
              Promise.resolve(
                responses[u] || {
                  status: 0,
                  statusText: '',
                  headers: [],
                  content_type: null,
                  data: '',
                  xml: null,
                  getHeader: () => null,
                },
              ),
            query: (u) => Promise.resolve(responses[u] || { status: 0, headers: [], data: '' }),
          };
          // Optional per-case mock sidecar (HTTP resources/headers) for the Palier A header rules.
          g.sidecar = {
            resources: (sidecar && sidecar.resources) || [],
            events: [],
            pageInfo: $.extractPageInfo(),
            plainText: new XMLSerializer().serializeToString(document),
          };
          g.tests = rules;
          g.criteria = subset;
          const arr = await g.analyze(subset).then((r) => g.synthesize_results(r));
          const row = (Array.isArray(arr) ? arr : [])[0] || {};
          return { result: row.result, details: (row.details || []).length };
        },
        { libSources, rules, subset, sidecar: c.sidecar || null },
      );
      // `details` (optional): how many elements the rule must flag — for the semi-automatic rules
      // whose verdict is "i" either way, it is what tells a right answer from a wrong one.
      const ok = out.result === c.verdict && (c.details === undefined || out.details === c.details);
      results.push({ ...c, wantDetails: c.details, got: out.result, details: out.details, ok });
    } catch (e) {
      results.push({ ...c, got: 'ERROR: ' + (e.message || e), ok: false });
    } finally {
      await page.close();
    }
  }
} finally {
  await browser.close();
}

const pass = results.filter((r) => r.ok);
const fail = results.filter((r) => !r.ok);
console.log(`\nV5 test set — ${pass.length}/${results.length} cases pass\n`);
const byRule = {};
for (const r of results) (byRule[`#${r.num} ${r.rule}`] ??= []).push(r);
for (const [k, rs] of Object.entries(byRule)) {
  const bad = rs.filter((r) => !r.ok);
  console.log(`${bad.length ? '✗' : '✓'} ${k} — ${rs.length - bad.length}/${rs.length}`);
  for (const r of bad)
    console.log(
      `    [${r.verdict}${r.wantDetails === undefined ? '' : ` + ${r.wantDetails} flagged`} expected] got ${r.got} (details ${r.details ?? '-'})`,
    );
}
if (fail.length) {
  console.error(`\n${fail.length} case(s) failed.`);
  process.exit(1);
}
console.log('\nAll V5 test cases pass.');

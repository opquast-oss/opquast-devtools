// Golden-master gate for the V5 automation OVERLAY (data/engine-overlay/*).
// Same mechanism as golden.mjs, but drives the V5 path: it loads the merged
// public/engine/rulesets.json + the oqs-tests-overlay.js overlay lib, runs the engine
// in headless Chromium against a fixture that exercises the pilot criteria, and locks
// the verdicts to test/golden/baseline-v5.json.
//
// REQUIRES a browser (Playwright). Runs anywhere one is installed, dev container included:
//   npx playwright install chromium
// The revision matters — playwright resolves a specific one, and a browser installed by another
// project does not satisfy it. That mismatch is what made this look like an architecture problem.
//
//   npm run sync-assets                                # rebuild public/engine assets
//   node test/golden/golden-v5.mjs --update      # record baseline
//   node test/golden/golden-v5.mjs               # compare (fails on any verdict drift)
//
// The fixture below is built so each pilot criterion has a deterministic verdict; the
// expected outcome is noted inline, but the baseline is whatever the real engine emits.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '../..');
const ENGINE = join(ROOT, 'public/engine');
const BASELINE = join(HERE, 'baseline-v5.json');
const UPDATE = process.argv.includes('--update');

// Injection order matches src/lib/engine-assets.ts (overlay lib LAST).
const LIBS = [
  'jquery-3.7.1.min.js',
  'jquery-migrate-3.5.2.min.js',
  'oqs-utils.js',
  'cssParser.js',
  'oqs-validator.js',
  'oqs-tests.js',
  'oqs-tests-overlay.js',
];

// Pilot criteria (V5 ids) with the verdict the fixture is designed to produce.
const PILOT = {
  54438: 'c', // lang="fr" valid                          -> compliant
  54450: 'c', // <meta charset> present                   -> compliant
  54513: 'c', // h1 then h2, no hierarchy gap             -> compliant
  54378: 'c', // font-family ends with a generic family   -> compliant
  54535: 'c', // no text-align:justify                    -> compliant
  54491: 'nc', // an empty <a href="#"></a>                -> non-compliant
  54399: 'nc', // data table, <th> without scope/id        -> non-compliant
  53935: 'i', // no simulated list detected               -> intermediate (semi-auto)
};

const FIXTURE_HTML = `<!doctype html><html lang="fr"><head><meta charset="utf-8">
<title>Fixture overlay V5</title>
<style>body{font-family:Georgia, serif} p{text-align:left}</style></head>
<body>
<h1>Titre principal</h1>
<h2>Sous-titre</h2>
<p>Un paragraphe de contenu normal.</p>
<nav><a href="/accueil">Accueil</a><a href="#"></a></nav>
<table><caption>Données</caption>
<tr><th>Nom</th><th>Valeur</th></tr>
<tr><td>A</td><td>1</td></tr></table>
</body></html>`;

async function runEngine() {
  const libSources = LIBS.map((f) => readFileSync(join(ENGINE, f), 'utf8'));
  const rules = JSON.parse(readFileSync(join(ENGINE, 'rules.json'), 'utf8'));
  const rulesets = JSON.parse(readFileSync(join(ENGINE, 'rulesets.json'), 'utf8'));
  const subset = {};
  for (const id of Object.keys(PILOT)) if (rulesets[id]) subset[id] = rulesets[id];
  const missing = Object.keys(PILOT).filter((id) => !subset[id]);
  if (missing.length) {
    console.error(`[golden-v5] pilot criteria absent from rulesets.json: ${missing.join(', ')}`);
    console.error('  Did you run `npm run sync-assets`?');
    process.exit(2);
  }

  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage();
    await page.setContent(FIXTURE_HTML, { waitUntil: 'domcontentloaded' });
    return await page.evaluate(
      async ({ libSources, rules, subset }) => {
        for (const src of libSources) {
          const s = document.createElement('script');
          s.textContent = src;
          document.head.appendChild(s);
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
              statusText: '',
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
        g.criteria = subset;
        const out = await g.analyze(subset).then((r) => g.synthesize_results(r));
        return (Array.isArray(out) ? out : [])
          .map((r) => ({ id: r.id, result: r.result, details: (r.details || []).length }))
          .sort((a, b) => a.id.localeCompare(b.id));
      },
      { libSources, rules, subset },
    );
  } finally {
    await browser.close();
  }
}

const result = await runEngine();

// Sanity: warn if any verdict disagrees with the fixture's designed expectation.
for (const r of result) {
  const want = PILOT[r.id];
  if (want && want !== r.result) {
    console.warn(
      `[golden-v5] note: #${r.id} produced "${r.result}" (fixture designed for "${want}")`,
    );
  }
}

if (UPDATE) {
  if (!existsSync(HERE)) mkdirSync(HERE, { recursive: true });
  writeFileSync(BASELINE, JSON.stringify(result, null, 2) + '\n');
  console.log(`[golden-v5] baseline recorded: ${result.length} criteria → ${BASELINE}`);
  process.exit(0);
}

if (!existsSync(BASELINE)) {
  console.error('[golden-v5] no baseline — run with --update first (on a machine with a browser).');
  process.exit(2);
}
const baseline = readFileSync(BASELINE, 'utf8').trim();
const current = (JSON.stringify(result, null, 2) + '\n').trim();
if (baseline === current) {
  console.log(`[golden-v5] OK — ${result.length} pilot criteria match the baseline.`);
  process.exit(0);
}
console.error('[golden-v5] REGRESSION — overlay engine output differs from baseline:');
const byId = new Map(JSON.parse(baseline).map((r) => [r.id, r]));
for (const r of result) {
  const prev = byId.get(r.id);
  if (!prev || prev.result !== r.result || prev.details !== r.details) {
    console.error(
      `  ${r.id}: baseline=${prev ? prev.result + '/' + prev.details : '∅'} → now=${r.result}/${r.details}`,
    );
  }
}
process.exit(1);

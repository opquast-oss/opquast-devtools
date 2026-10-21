// End-to-end run of the built extension in real browsers: installation, configuration (options
// page), inspection of a served page and rendering of the panel, in Chrome and Firefox.
// See README.md. Usage:
//
//   npm run e2e                                  # build both targets, run both browsers
//   node test/e2e/run.mjs --browser=chrome       # reuse the current .output/ build
//
// Writes screenshots and report.md to test/e2e/out/; exits non-zero if any scenario fails.

import { createServer } from 'node:http';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { prepare } from './prepare.mjs';
import { launchChrome } from './chrome.mjs';
import { launchFirefox } from './firefox.mjs';
import { getFirefox } from './get-firefox.mjs';
import { SCENARIOS } from './scenarios.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '../..');
const OUT = join(HERE, 'out');
const VERSION = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).version;

const arg = process.argv.find((a) => a.startsWith('--browser='))?.split('=')[1] ?? 'all';
const BROWSERS = arg === 'all' ? ['chrome', 'firefox'] : arg.split(',');

// The inspected page, over http so it is a page the engine may analyse.
function serveFixture() {
  const page = readFileSync(join(HERE, 'fixtures/page.html'));
  const server = createServer((req, res) => {
    if (req.url === '/' || req.url === '/index.html') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(page);
    } else if (req.url === '/slow') {
      // Same page, answered late: the analysis starts while the tab is still loading.
      setTimeout(() => {
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
        res.end(page);
      }, 1500);
    } else {
      res.writeHead(404, { 'content-type': 'text/plain' });
      res.end('not found');
    }
  });
  return new Promise((resolve) =>
    server.listen(0, '127.0.0.1', () =>
      resolve({ server, url: `http://127.0.0.1:${server.address().port}/` }),
    ),
  );
}

async function launch(name) {
  if (name === 'chrome') {
    const { dir } = prepare('chrome-mv3');
    return { driver: await launchChrome(dir), dir };
  }
  if (name === 'firefox') {
    const { dir, manifest } = prepare('firefox-mv3');
    return { driver: await launchFirefox(dir, manifest, await getFirefox()), dir };
  }
  throw new Error(`unknown browser "${name}" (chrome, firefox)`);
}

async function runBrowser(name, fixtureUrl) {
  const outDir = join(OUT, name);
  mkdirSync(outDir, { recursive: true });
  const results = [];
  let driver;
  let dir;
  try {
    ({ driver, dir } = await launch(name));
  } catch (e) {
    return [
      { id: 'launch', title: `Lancement de ${name}`, status: 'fail', note: String(e), shots: [] },
    ];
  }
  // The panel runs in French by default, so it shows the French names.
  const checklistNames = JSON.parse(readFileSync(join(dir, 'checklists/index.json'), 'utf8')).map(
    (c) => c.names.fr,
  );

  const memo = {}; // facts one scenario hands to a later one (same browser)
  for (const sc of SCENARIOS) {
    const r = { id: sc.id, title: sc.title, shots: [] };
    results.push(r);
    if (sc.only && sc.only !== name) {
      Object.assign(r, { status: 'skip', note: sc.skipReason ?? `${sc.only} only` });
      continue;
    }
    const ctx = {
      driver,
      fixtureUrl,
      version: VERSION,
      checklistNames,
      memo,
      shippedDir: join(ROOT, '.output', `${name}-mv3`),
      async shot(tab, label) {
        const file = `${sc.id}--${label}.png`;
        // Let the drawer slide-in and tab transitions finish (the spinner never does: skip it).
        await tab.eval(() =>
          Promise.race([
            Promise.all(
              document
                .getAnimations()
                .filter((a) => a.effect?.getComputedTiming().iterations !== Infinity)
                .map((a) => a.finished.catch(() => {})),
            ),
            new Promise((r) => setTimeout(r, 2000)),
          ]).then(() => new Promise((r) => requestAnimationFrame(() => r(true)))),
        );
        await tab.screenshot(join(outDir, file));
        r.shots.push(`${name}/${file}`);
      },
    };
    const started = Date.now();
    try {
      r.note = (await sc.run(ctx)) ?? '';
      r.status = 'pass';
    } catch (e) {
      r.status = 'fail';
      r.note = e instanceof Error ? e.message : String(e);
    }
    r.seconds = ((Date.now() - started) / 1000).toFixed(1);
    console.log(`[e2e] ${name} ${r.status.toUpperCase().padEnd(4)} ${sc.id} — ${r.note}`);
  }

  if (driver.errors?.length) {
    results.push({
      id: 'page-errors',
      title: 'Erreurs JavaScript dans les pages de l’extension',
      status: 'fail',
      note: driver.errors.join(' | '),
      shots: [],
    });
  }
  await driver.close();
  return results;
}

function report(all) {
  const icon = { pass: '✅', fail: '❌', skip: '⏭️' };
  const lines = [
    `# Rapport e2e — Opquast DevTools ${VERSION}`,
    '',
    `Generated on ${new Date().toISOString()}.`,
    '',
  ];
  for (const [name, results] of Object.entries(all)) {
    lines.push(`## ${name}`, '', '| | Scenario | Detail | Screenshots |', '|---|---|---|---|');
    for (const r of results) {
      const shots = r.shots
        .map((s) => `[${s.split('--')[1].replace('.png', '')}](${s})`)
        .join(' · ');
      const note = (r.note ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
      lines.push(`| ${icon[r.status]} | ${r.title} | ${note} | ${shots} |`);
    }
    lines.push('');
  }
  writeFileSync(join(OUT, 'report.md'), lines.join('\n'));
}

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
const { server, url } = await serveFixture();
const all = {};
try {
  for (const name of BROWSERS) all[name] = await runBrowser(name, url);
} finally {
  server.close();
}
report(all);
const failed = Object.values(all)
  .flat()
  .filter((r) => r.status === 'fail').length;
console.log(
  `[e2e] report: ${join(OUT, 'report.md')} — ${failed ? `${failed} failure(s)` : 'all passed'}`,
);
process.exit(failed ? 1 : 0);

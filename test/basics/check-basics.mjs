// Guard-rail for the derived "Opquast Basics" checklist (901-opquast-basics).
// Basics is the tagged subset of Opquast V5 reusing the same criterion IDs, so its automations come
// for free from the shared rulesets.json. This locks that invariant and catches tag/derive drift.
//
// Browser-free — runs anywhere (incl. the dev container):  node test/basics/check-basics.mjs
// Prerequisite: npm run derive-basics && npm run sync-assets  (so public/ is up to date).

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const read = (p) => JSON.parse(readFileSync(join(ROOT, p), 'utf8'));

const EXPECTED = 65;
const LANGS = ['fr', 'en'];
let failed = false;
const fail = (m) => {
  console.error(`  ✗ ${m}`);
  failed = true;
};

// 1. Each shipped Basics language file has 65 criteria, all a subset of the V5 IDs.
for (const lang of LANGS) {
  const basics = Object.keys(read(`public/checklists/${lang}/901-opquast-basics.json`));
  const v5 = new Set(Object.keys(read(`public/checklists/${lang}/900-opquast-v5.json`)));
  if (basics.length !== EXPECTED)
    fail(`${lang}: ${basics.length} Basics criteria, expected ${EXPECTED}`);
  const strays = basics.filter((id) => !v5.has(id));
  if (strays.length)
    fail(`${lang}: ${strays.length} Basics ids absent from V5 (${strays.slice(0, 3)}…)`);
}

// 2. Manifest exposes Basics, named in both languages.
const entry = read('public/checklists/index.json').find((c) => c.slug === '901-opquast-basics');
if (!entry) fail('manifest: 901-opquast-basics missing');
else if (!entry.names?.en || !entry.names?.fr)
  fail('manifest: 901-opquast-basics needs en + fr names');

// 3. Basics shares V5 automations by ID keying (report count; expected to grow as the overlay expands).
const rulesets = read('public/engine/rulesets.json');
const automated = Object.keys(read('public/checklists/fr/901-opquast-basics.json')).filter(
  (id) => id in rulesets,
);

if (failed) {
  console.error('check-basics: FAILED');
  process.exit(1);
}
console.log(
  `check-basics: OK — 65 Basics criteria ⊆ V5, in the manifest, ${automated.length} automated via rulesets.json.`,
);

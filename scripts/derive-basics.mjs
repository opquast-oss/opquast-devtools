#!/usr/bin/env node
/**
 * Derives the "Opquast Basics" checklist (901-opquast-basics) from the already-committed Opquast V5
 * checklist (900-opquast-v5). Basics is not a distinct referential: it is the 65 criteria of the 245
 * V5 criteria carrying the `"Basics"` tag. We reuse the SAME criterion IDs, so the engine (which keys
 * automations by numeric criterion ID via rulesets.json) lights up their automations for free —
 * no rule duplication, identical evaluation.
 *
 * Offline & deterministic: reads data/checklists/{lang}/900-opquast-v5.json, filters `tags ⊇ Basics`
 * (V5 insertion order preserved), keeps each criterion verbatim (incl. its V5 `name`/number) and only
 * rewrites `checklist` to { id: 901, name: "Opquast Basics" }.
 *
 * Re-run after every V5 refresh (scripts/fetch-v5-checklist.mjs), then: npm run sync-assets
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '..', 'data', 'checklists');

const SRC_SLUG = '900-opquast-v5';
const DST_SLUG = '901-opquast-basics';
const BASICS_TAG = 'Basics';
const DST_CHECKLIST = { id: 901, name: 'Opquast Basics' };
const EXPECTED = 65;
const LANGS = ['fr', 'en'];

// Derive every language first, write only if all are right: a tag drift must not leave a wrong
// Basics file on disk next to the error.
const out = [];
for (const lang of LANGS) {
  const srcPath = join(DATA_DIR, lang, `${SRC_SLUG}.json`);
  if (!existsSync(srcPath)) {
    console.error(
      `✗ missing ${srcPath}: fetch the V5 checklist first (scripts/fetch-v5-checklist.mjs)`,
    );
    process.exit(1);
  }
  const src = JSON.parse(readFileSync(srcPath, 'utf8'));

  const basics = {};
  for (const [id, criterion] of Object.entries(src)) {
    const tags = Array.isArray(criterion.tags) ? criterion.tags : [];
    if (!tags.includes(BASICS_TAG)) continue;
    basics[id] = { ...criterion, checklist: { ...DST_CHECKLIST } };
  }

  const count = Object.keys(basics).length;
  console.log(`${lang}: ${DST_SLUG} — ${count} criteria`);
  if (count !== EXPECTED) {
    console.error(
      `  ✗ expected ${EXPECTED} Basics criteria, got ${count} (tag drift?): nothing written`,
    );
    process.exit(1);
  }
  out.push([join(DATA_DIR, lang, `${DST_SLUG}.json`), basics]);
}

for (const [dstPath, basics] of out) writeFileSync(dstPath, JSON.stringify(basics, null, 2) + '\n');

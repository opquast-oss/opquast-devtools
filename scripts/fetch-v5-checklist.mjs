#!/usr/bin/env node
/**
 * Fetches the Opquast V5 checklist and converts it to the extension format.
 * Two sources:
 *   - Live API: API_KEY=xxx node scripts/fetch-v5-checklist.mjs
 *   - Local dump (a saved response of api.opquast.com/checklist/extended/):
 *       CHECKLIST_JSON=path/to/response.json node scripts/fetch-v5-checklist.mjs
 * Then run: npm run sync-assets
 */

import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '..', 'data', 'checklists');

const API_KEY = process.env.API_KEY;
const CHECKLIST_JSON = process.env.CHECKLIST_JSON;
if (!API_KEY && !CHECKLIST_JSON) {
  console.error('Error: set API_KEY (live API) or CHECKLIST_JSON (path to a saved API response)');
  process.exit(1);
}

const CHECKLIST_SLUG = 'opquast-v5';
const CHECKLIST_NAME = 'Qualité Web - Opquast V5';
const LANGS = ['fr', 'en'];

async function fetchV5Checklist() {
  if (CHECKLIST_JSON) {
    return unwrap(JSON.parse(readFileSync(CHECKLIST_JSON, 'utf8')));
  }

  const response = await fetch('https://api.opquast.com/checklist/extended/', {
    headers: { Authorization: `Api-Key ${API_KEY}` },
  });

  if (!response.ok) {
    throw new Error(`API error: ${response.status} ${response.statusText}`);
  }

  return unwrap(await response.json());
}

/** The criteria array from the raw array or a wrapper ({criteria|results|data: [...]}), checked. */
function unwrap(data) {
  const criteria = Array.isArray(data) ? data : data?.criteria || data?.results || data?.data;
  if (!Array.isArray(criteria) || criteria.length === 0) {
    throw new Error('no criteria found in the checklist JSON (unexpected shape or empty)');
  }
  const broken = criteria.filter((c) => c?.id == null || c?.number == null);
  if (broken.length) throw new Error(`${broken.length} criteria have no id or number`);
  return criteria;
}

/**
 * Keep only what the extension shows: number, description, section, tags, phases. The API also
 * returns the explanatory texts (goal, solution, control, explanation, vulgarization), which are
 * Opquast's partner content: they must never be written to this repository.
 */
function convertToExtensionFormat(criteria, lang) {
  const result = {};
  for (const criterion of criteria) {
    result[String(criterion.id)] = {
      checklist: { id: 900, name: CHECKLIST_NAME },
      name: String(criterion.number),
      thema: criterion.metadata?.['Thématiques']?.[0] || '',
      description: criterion.description?.[lang] || criterion.description?.fr || '',
      tags: criterion.metadata?.['Tags'] || [],
      phases: criterion.metadata?.['Phases projet'] || [],
    };
  }
  return result;
}

async function main() {
  console.log('Fetching Opquast V5 checklist from API...');
  const criteria = await fetchV5Checklist();
  console.log(`Received ${criteria.length} criteria`);

  for (const lang of LANGS) {
    const converted = convertToExtensionFormat(criteria, lang);
    const outDir = join(DATA_DIR, lang);
    mkdirSync(outDir, { recursive: true });

    const outPath = join(outDir, `900-${CHECKLIST_SLUG}.json`);
    writeFileSync(outPath, JSON.stringify(converted, null, 2) + '\n');
    console.log(`Written: ${outPath}`);
  }

  console.log('\nDone! Now run: npm run derive-basics && npm run sync-assets');
}

main().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});

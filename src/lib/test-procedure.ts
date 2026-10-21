// "How it is tested": the engine tests behind a criterion, each with a one-line description in the
// panel's language. Both files are produced by scripts/sync-assets.mjs.

import { loadJSON, type Rulesets } from './engine-assets';

let rulesets: Promise<Rulesets> | null = null;
const descriptions = new Map<string, Promise<Record<string, string>>>();

const RESERVED_KEYS = new Set(['onfalse', 'ontrue', 'chain', 'comment', 'result', 'results_list']);

/** Test names in a ruleset decision tree: every all-uppercase key that is not a reserved keyword. */
function collectTests(node: unknown, tests: Set<string>): Set<string> {
  if (typeof node !== 'object' || node === null) return tests;
  for (const [key, value] of Object.entries(node)) {
    if (!RESERVED_KEYS.has(key) && /^[A-Z_0-9]+$/.test(key)) tests.add(key);
    collectTests(value, tests);
  }
  return tests;
}

/** The tests of a criterion, sorted, with their description (null when there is none). */
export async function getTestDescriptionsForCriterion(
  criterionId: string,
  lang: string,
): Promise<{ name: string; description: string | null }[]> {
  // A failed load is not cached: the next call tries again.
  rulesets ??= loadJSON<Rulesets>('engine/rulesets.json').catch((e) => {
    rulesets = null;
    throw e;
  });
  if (!descriptions.has(lang)) {
    descriptions.set(
      lang,
      loadJSON<Record<string, string>>(`test-descriptions/${lang}.json`).catch(() => ({})),
    );
  }
  const [all, texts] = await Promise.all([rulesets, descriptions.get(lang)!]);
  const tests = [...collectTests(all[criterionId], new Set())].sort();
  return tests.map((name) => ({ name, description: texts[name] ?? null }));
}

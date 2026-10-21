// Helpers for loading the vendored engine data and listing the engine lib files.
// Paths are relative to the extension root (populated by scripts/sync-assets.mjs into public/).

// Injection order matters: jQuery first (the oqs IIFEs are invoked with `(jQuery, this)`), then
// jQuery Migrate (restores the jQuery-1.x APIs the legacy engine still uses — .size(), ajax
// .success/.error… — on jQuery 3; AMO bans jQuery 1.9.1, so we ship 3.7.1 instead), then
// utils/parser, then the validator (defines analyze/synthesize_results), then the tests.
export const ENGINE_FILES = [
  'engine/jquery-3.7.1.min.js',
  'engine/jquery-migrate-3.5.2.min.js',
  'engine/oqs-utils.js',
  'engine/cssParser.js',
  'engine/oqs-validator.js',
  'engine/oqs-tests.js',
  // V5 automation overlay — extra oqs@ functions, injected AFTER the legacy tests
  // (source: data/engine-overlay/oqs-tests-overlay.js, copied by scripts/sync-assets.mjs).
  'engine/oqs-tests-overlay.js',
] as const;

export async function loadJSON<T = unknown>(path: string): Promise<T> {
  const url = browser.runtime.getURL(path as any);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load ${path}: ${res.status}`);
  return (await res.json()) as T;
}

export type Rules = Record<string, string>;
export type Rulesets = Record<string, unknown>;
export type ChecklistFile = Record<string, ChecklistCriterion>;

export interface ChecklistCriterion {
  id?: string;
  name?: string;
  description?: string;
  goal?: string;
  solution?: string;
  explanation?: string;
  thema?: string;
  checklist?: { id?: number; name?: string };
  // V5-specific fields
  control?: string; // Manual verification instructions
  vulgarization?: string; // Accessible explanation
  tags?: string[]; // Topic tags (Accessibilité, SEO, Privacy...)
}

/** Subset the full rulesets to just the criterion ids of a checklist. */
export function subsetRulesets(rulesets: Rulesets, criterionIds: string[]): Rulesets {
  const out: Rulesets = {};
  for (const id of criterionIds) {
    if (id in rulesets) out[id] = rulesets[id];
  }
  return out;
}

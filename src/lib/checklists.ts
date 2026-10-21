// Checklist registry, loaded from the manifest produced by scripts/sync-assets.mjs.

export interface ChecklistInfo {
  slug: string; // e.g. "900-opquast-v5"
  names: Record<string, string>; // display name per language, e.g. { fr: "Qualité Web - Opquast V5" }
  langs: string[]; // available languages, e.g. ["en", "fr"]
}

export async function loadChecklistManifest(): Promise<ChecklistInfo[]> {
  const url = browser.runtime.getURL('checklists/index.json' as any);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`checklist manifest: ${res.status}`);
  return (await res.json()) as ChecklistInfo[];
}

export const DEFAULT_SLUG = '901-opquast-basics';

/** Pick a language for a checklist: prefer the requested one, else fr, else first available. */
export function pickLang(info: ChecklistInfo, preferred: string): string {
  if (info.langs.includes(preferred)) return preferred;
  if (info.langs.includes('fr')) return 'fr';
  return info.langs[0] ?? 'fr';
}

/** Display name of `slug` in `lang` (else its French name, else the slug itself). */
export function checklistName(manifest: ChecklistInfo[], slug: string, lang: string): string {
  const info = manifest.find((c) => c.slug === slug);
  return info?.names[lang] ?? info?.names.fr ?? slug;
}

/**
 * Keep the checklist preferences within what this build ships. Stored preferences outlive the
 * checklists they name: a slug that is no longer in the manifest is dropped, and when nothing is
 * left the default checklist is enabled again, so the panel never ends up with an empty selector.
 */
export function shippedSelection(
  manifest: ChecklistInfo[],
  enabledChecklists: string[],
  slug: string,
): { enabledChecklists: string[]; slug: string } {
  const shipped = new Set(manifest.map((c) => c.slug));
  let enabled = enabledChecklists.filter((s) => shipped.has(s));
  if (!enabled.length) {
    const fallback = shipped.has(DEFAULT_SLUG) ? DEFAULT_SLUG : manifest[0]?.slug;
    enabled = fallback ? [fallback] : [];
  }
  return { enabledChecklists: enabled, slug: enabled.includes(slug) ? slug : (enabled[0] ?? slug) };
}

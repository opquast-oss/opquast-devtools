// Shared checklist <select> population, used by the panel toolbar and the options page.

import { checklistName, type ChecklistInfo } from '@/lib/checklists';

/**
 * (Re)fill a checklist `<select>` from the manifest, keeping only the `enabled` slugs and preserving
 * the current selection when still visible (else `defaultSlug`, else the first entry).
 * Labels are in `lang`; `withLangs` appends the available languages to each label (options page).
 */
export function populateChecklistDropdown(
  select: HTMLSelectElement,
  manifest: ChecklistInfo[],
  enabled: Iterable<string>,
  lang: string,
  opts: { defaultSlug?: string; withLangs?: boolean } = {},
): void {
  const enabledSet = new Set(enabled);
  const visible = manifest.filter((c) => enabledSet.has(c.slug));
  const current = select.value;
  select.replaceChildren(
    ...visible.map((c) => {
      const o = document.createElement('option');
      o.value = c.slug;
      const name = checklistName(manifest, c.slug, lang);
      o.textContent = opts.withLangs ? `${name} (${c.langs.join('/')})` : name;
      return o;
    }),
  );
  if (visible.some((c) => c.slug === current)) {
    select.value = current;
  } else if (opts.defaultSlug && visible.some((c) => c.slug === opts.defaultSlug)) {
    select.value = opts.defaultSlug;
  } else {
    const first = visible[0];
    if (first) select.value = first.slug;
  }
}

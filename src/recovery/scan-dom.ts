// Injected into the page to list the sub-resource URLs its DOM references. Self-contained
// (serialised by scripting.executeScript). The background then re-fetches them (refetch-service.ts)
// to back the page-side XHR and the image checks.

export interface ScannedItem {
  uri: string;
  type: 'script' | 'stylesheet' | 'image';
}

export function scanDomResources(): ScannedItem[] {
  const items: ScannedItem[] = [];
  const push = (uri: string | null | undefined, type: ScannedItem['type']) => {
    if (uri && /^https?:/i.test(uri)) items.push({ uri, type });
  };
  document
    .querySelectorAll('script[src]')
    .forEach((s) => push((s as HTMLScriptElement).src, 'script'));
  document
    .querySelectorAll('link[rel~="stylesheet"][href]')
    .forEach((l) => push((l as HTMLLinkElement).href, 'stylesheet'));
  document.querySelectorAll('img[src]').forEach((i) => push((i as HTMLImageElement).src, 'image'));
  return items;
}

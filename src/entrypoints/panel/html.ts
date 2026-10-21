// Pure string helpers for the panel: HTML escaping, and entity decoding + tag
// reconstruction for occurrence snippets. No DOM or state dependencies.

import type { Detail } from '@/lib/types';

export function esc(s: unknown): string {
  return String(s ?? '').replace(
    /[&<>"]/g,
    (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch] as string,
  );
}

/** Decode the entities the engine escapes into detail.text (deterministic; no HTML parsing). */
export function decodeEntities(s: string): string {
  return String(s)
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&');
}

export function reconstructTag(d: Detail): string {
  if (!d.tag) return d.selector || d.xpath || '';
  const attrs = (d.attributes ?? []).map((a) => `${a.name}="${a.value}"`).join(' ');
  return `<${d.tag}${attrs ? ' ' + attrs : ''}>`;
}

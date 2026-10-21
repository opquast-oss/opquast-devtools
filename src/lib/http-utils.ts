// Shared HTTP header conversions used by the recovery layer.

/** Fold a `{ name, value }` header list into a lowercased Record (repeated names comma-joined). */
export function headersToRecord(list?: { name: string; value?: string }[]): Record<string, string> {
  const headers: Record<string, string> = {};
  for (const h of list ?? []) {
    const name = h.name.toLowerCase();
    const value = h.value ?? '';
    headers[name] = name in headers ? `${headers[name]},${value}` : value;
  }
  return headers;
}

/** Convert a Fetch `Headers` object into a lowercased `{ name, value }[]` array. */
export function headersFromFetch(h: Headers): { name: string; value: string }[] {
  const out: { name: string; value: string }[] = [];
  h.forEach((value, name) => out.push({ name: name.toLowerCase(), value }));
  return out;
}

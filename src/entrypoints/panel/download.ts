/**
 * Hand a generated file to the user.
 *
 * An `<a download>` click rather than `browser.downloads.download`: the latter silently fails on a
 * `blob:` URL from a DevTools panel page, and this needs no `downloads` permission — one less thing
 * to justify to a store reviewer.
 *
 * Lives in its own module because both main.ts and feedbacks-view.ts need it, and importing one
 * from the other would create a cycle.
 */
export function downloadText(filename: string, text: string, mime = 'text/csv;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** `YYYY-MM-DD` of `ts` in the user's time zone, for file names ('' for an invalid date). */
export function fileDate(ts: number = Date.now()): string {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** The page's host for a file name: `www.example.com`, `localhost-8080`, '' when there is none. */
export function fileHost(url: string): string {
  try {
    return new URL(url).host.replace(/[^\w.-]+/g, '-');
  } catch {
    return '';
  }
}

/** Join the non-empty parts of a file name with '-'. */
export function fileName(parts: string[], ext: string): string {
  return `${parts.filter(Boolean).join('-')}.${ext}`;
}

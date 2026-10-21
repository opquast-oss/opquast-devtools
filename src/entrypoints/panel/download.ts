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

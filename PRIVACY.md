# Privacy Policy — Opquast DevTools

_Last updated: 2026-10_

Opquast DevTools is a browser DevTools extension that runs Opquast quality &
accessibility checks against the page you are inspecting. **It does not collect,
transmit, or share any personal data.**

## What the extension stores — and where

All data stays **on your device**, in the browser's local storage:

| Data | Where | Purpose |
| --- | --- | --- |
| Analysis results (verdicts, scores, page metadata) | IndexedDB (`opquast-devtools`) | Show and re-open past analyses |
| Manual overrides & comments | IndexedDB | Let you adjust a verdict / annotate a criterion |
| Feedback journal (your notes on a verdict, when feedback participation is on) | IndexedDB | Traceability of your review |
| App feedback (your opinion about the extension) | `storage.local` | Kept locally until you choose to send it |
| Preferences (checklist selection, language, auto-run…) | `storage.local` | Remember your settings |

Nothing is sent to Opquast servers or any third party. There is **no account, no
telemetry, no analytics, no tracking**.

The **feedback** you write (on a verdict, or "Give feedback" in the About tab) is
stored only on your device. It leaves your browser **solely** if you select it in
the Feedbacks tab and click "Prepare an e-mail with selected feedbacks", which
opens a pre-filled message in **your own** mail client — you remain in control of
whether and what to send. The extension never sends it automatically. The draft
holds the selected feedbacks (your text, the criterion, its verdict, the date and
the page address **without its query string or fragment**), plus the extension and
engine versions; not your browser's user agent.

Turning feedback participation off stops new feedback; it does not delete what is
already recorded. Those feedbacks stay in the panel's **Feedbacks** tab, which
remains visible until you have deleted them all.

## Network activity

The extension makes requests **only** to the extension's own bundled assets
(rules, checklists, engine libraries) and to resources of the page you are
inspecting. It never contacts an Opquast server, an analytics endpoint, or any
third-party service of its own.

To reconstruct the inputs the engine needs, it re-fetches the resources the
inspected page itself references:

- **Page resources** (scripts, stylesheets, images) — these can include
  **third-party hosts** (CDNs, external assets) that the page loads. Resources
  of the inspected page's own origin are re-fetched with the browser's
  credentials (`credentials: 'include'`), so authenticated assets resolve as
  they do for the page; resources of any other origin are re-fetched **without
  credentials**. Redirects are not followed, so a resource cannot lead the
  extension, or your cookies, anywhere other than the address the page names;
  a redirected resource is left out of the analysis. When a page on a public
  address names this machine or the local network (`localhost`, `*.local`,
  private, loopback, link-local and reserved addresses), the extension does not
  fetch it; a page that is itself local still can. The check is made on the
  address as written: an extension cannot see what a domain name resolves to.
  Each re-fetch gives up after 10 seconds. The responses are used only to
  compute verdicts locally.
- **The page itself**, once more, from the background: only its response
  headers are read (security headers, character set, server), the body is not
  downloaded. With your cookies for that site, as the browser loaded it; a
  redirect is not followed. The server sees one more request for the page.
- **Site-root artefacts** of the inspected site (`robots.txt`, `sitemap.xml`,
  a 404 probe, and the home page of its `www.` / non-`www.` variant) — fetched
  **without credentials** (`credentials: 'omit'`), without following
  redirects, and given up after 5 seconds.

These are the same hosts the page already talks to; **no data is transmitted to
Opquast or to any third party controlled by the extension**, and nothing about
your analysis leaves your browser.

The Firefox manifest declares this explicitly:
`data_collection_permissions: { required: ["none"] }`.

## Your control over the data

- Export any analysis or the feedback journal as **CSV** from the panel.
- Clear the analysis history from the options page (**Local data** → **Clear the analysis
  history**). Analyses are otherwise kept until you clear them: there is no automatic expiry.
- Undo a manual change on a criterion from its detail in the panel.
- Delete feedbacks, one by one or all at once, from the panel's **Feedbacks** tab — also
  after turning participation off.
- Uninstalling the extension removes all locally stored data.

## Contact

Questions about this policy: <https://www.opquast.com>.

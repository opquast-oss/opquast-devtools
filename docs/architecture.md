# Architecture

Opquast DevTools is a [WXT](https://wxt.dev) extension built for Chrome and Firefox from one
codebase (Manifest V3 on both). This page follows an analysis from the panel to the stored result.

## Parts

| Part | File | Role |
| --- | --- | --- |
| DevTools page | `src/entrypoints/devtools/main.ts` | Registers the **Opquast** panel. |
| Panel | `src/entrypoints/panel/` | The UI: tabs, tables, detail, feedbacks. Talks to the background over a port. |
| Background | `src/entrypoints/background.ts` | Runs analyses, owns storage. Stateless between messages, so the service worker (Chrome) or event page (Firefox) can be suspended. |
| Options page | `src/entrypoints/options/` | Checklists, language, automatic launch, feedback participation, site access. |
| Engine runner | `src/engine/run-in-page.ts` | Injected into the inspected page: sets up what the engine expects, runs it, returns the verdicts. |
| Recovery | `src/recovery/` | Gathers what the engine read from Firefox APIs in Opquast Desktop: the page's resources and a few site-root files. |

## The panel ⇄ background protocol

The panel opens a long-lived port named `oqs-panel`. Both directions are typed as discriminated
unions in `src/lib/messages.ts` (`PanelRequest`, `BgResponse`); the background handles them in
one `switch`. The port reconnects by itself when the service worker is suspended
(`createResilientPort` in `src/entrypoints/panel/context.ts`).

## An analysis, step by step

1. **The panel asks** (`ANALYZE`): the inspected tab, the active checklist, every enabled
   checklist, the language, and the page URL as the panel sees it.
2. **The background waits** for the tab to finish loading (DevTools may open on a page still
   loading), then loads the checklist files for that language.
3. **It gathers the inputs** (`runEngine`):
   - `scanDomResources` lists the scripts, stylesheets and images the page references;
   - `refetchResources` fetches them from the background, where the `<all_urls>` host permission
     lifts CORS, to get their bodies, headers, image size and animation. Because the page chooses
     these URLs, cookies go only to the page's own origin, redirects are refused (the checks
     below hold for the URL fetched, not for wherever it would redirect), a public page cannot
     name a local-network address (`isPrivateHost` in `src/lib/page-access.ts`, which judges
     the host as written, not its DNS resolution), and each fetch times out after 10 s;
   - `probeRoot` fetches `robots.txt`, `sitemap.xml`, a page that should not exist (404) and the
     `www.` / non-`www.` variant of the site, without cookies, without following redirects
     (a redirect is the expected answer for the `www.` variant; elsewhere the rule answers
     "i"), within 5 s each, body included.
4. **It runs the engine** in the page's isolated world: the engine files listed in
   `src/lib/engine-assets.ts`, then `runEngineInPage`, which serves the re-fetched bodies to the
   engine's XHR, reads inline `on*` handlers as the page's events, and calls the engine on the
   rulesets of the requested criteria.
5. **It builds one result per checklist** (`projectChecklists` in `src/engine/launch-tests.ts`):
   criteria the engine did not evaluate are "not tested"; criteria whose rules need an input the
   extension cannot provide (listeners added with `addEventListener`, for instance) are forced to
   "not tested" rather than given a verdict the engine could not establish. The list of such
   rules is generated at build time (`src/engine/rule-deps.generated.ts`).
6. **It stores** one analysis per checklist, stamped with the engine that produced it
   (`src/lib/versions.ts`), merges the user's overrides for that page, and answers `RESULT`.

If the browser refuses access to the tab, the background works out why (missing permission,
private window, a page no extension may reach) and the panel explains it
(`src/lib/page-access.ts`, `src/entrypoints/panel/access-view.ts`).

## Storage

IndexedDB database `opquast-devtools` (`src/lib/storage.ts`), three stores:

- `analyses` — one record per page × checklist × run: rows, scores, engine stamp;
- `userOverrides` — manual verdicts and notes, per page × criterion, applied on top of any
  analysis of that page (`mergeWithOverrides` in `src/lib/result-store.ts`);
- `feedbacks` — the feedback journal.

The background owns these stores, with one exception: the options page shares the extension's
origin and clears the `analyses` store directly (`clearAnalyses()`).

Preferences and app feedback live in `storage.local` (`src/lib/prefs.ts`,
`src/lib/app-feedback.ts`). Schema upgrades are in `openDB()`; the v3 upgrade shows how to migrate
records without breaking the upgrade transaction.

## The engine and the overlay

The engine, [opquast-test-runner](https://github.com/opquast-oss/opquast-test-runner), is a git
submodule under `packages/` and is never edited here. Its building blocks:

- **rules** (`rules.json`): named tests, each an XPath, a regular expression or a JavaScript
  function (`oqs@…`);
- **rulesets** (`rulesets.json`): per criterion, a decision tree over those tests that ends in a
  verdict — `c` (pass), `nc` (fail), `i` (to verify), `na` (not applicable).

The V5 checklist is automated by an **overlay** in this repository
(`data/engine-overlay/`, see its README): the V5 rulesets, the extra rules and the extra functions.
`scripts/sync-assets.mjs` merges the overlay with the engine at build time, ships only the rules
the rulesets use, and fingerprints the result, so every verdict can be traced to the exact engine
files that produced it. The overlay carries its own version, which the build refuses to ignore.

jQuery 1.9.1, which the engine was written against, is banned on AMO: the build ships jQuery
3.7.1 with jQuery Migrate instead (`data/vendor/`).

Reading `oqs-validator.js`, you will meet an `api_client` and `saveAndRefresh()` that post
results to `api_url`. They are leftovers of the Opquast Desktop server mode: nothing calls them,
and `api_url` is not even declared, so they cannot send anything. They stay because the engine
is not edited here. The engine's other `$.ajax` calls read the page's own resources;
`runEngineInPage` serves them from the background re-fetch when it holds them.

## Interface language

The panel and the options page follow the language chosen in the extension, not the browser's
locale: all strings are in `src/lib/ui-strings.ts`, static markup carries `data-i18n`
attributes filled by `localizeDocument()`. `browser.i18n` is used only for the store listing
(`public/_locales`, generated).

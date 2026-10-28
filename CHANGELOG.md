# Changelog

All notable changes to Opquast DevTools are documented here.
The format is based on [Keep a Changelog](https://keepachangelog.com/), and the
project aims to follow [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Internal

- The type-check leaves the engine submodule out: on a fresh clone it failed on the engine's
  own build config, whose dependencies are not installed.
- The end-to-end tests run on Firefox 159, which takes the remote agent's system access from the
  environment only (`MOZ_REMOTE_ALLOW_SYSTEM_ACCESS`); every Firefox scenario failed there.

## [0.7.1] - 2026-10-28

The source code is published on GitHub, in the `opquast-oss` organisation. No change to the
extension itself.

### Changed

- The repository, the engine submodule and the links of the documentation point to
  github.com/opquast-oss. The engine repository there carries its whole history, up to the
  commit 0.7.0 is built from.

## [0.7.0] - 2026-10-21

First public release of the source code. The history of this repository starts
here; earlier versions were developed privately and are summarised below.

### Added

- **Clear the analysis history** from the options page (new "Local data" section, with the
  number of stored analyses). Until now analyses were kept forever, although the privacy notice
  said they could be deleted. Manual changes and feedbacks are kept.

### Changed

- **The whole interface follows the language preference.** The panel's static
  labels, the score links, the criterion detail, the acknowledgments and the
  options page were partly French whatever the setting; they now switch
  between French and English. The test descriptions under "Test procedure"
  follow the panel language too (they used to follow the browser's).
- The English name of the V5 checklist is "Web Quality - Opquast V5" (it was
  shown in French).
- Preferences that name a checklist the extension no longer ships fall back to
  Opquast Basics instead of leaving the checklist selector empty.
- Only the engine rules a checklist actually uses are shipped (175 instead of
  1,003): the others were written for checklists retired before 0.5.1.
- **Re-fetching the page's resources is narrower.** Your cookies are sent only to the inspected
  page's own origin, no longer to the other sites it loads from. A page on a public address can
  no longer get the extension to fetch from this machine or the local network; a local page
  (localhost, private address) is analysed as before. Redirects are no longer followed, by the
  re-fetch or by the site-root probes: a redirected resource is left out, and `robots.txt` or
  `sitemap.xml` behind a redirect is "undetermined".
- **The CSV export neutralises formulas.** A cell starting with `=`, `+`, `-` or `@` (page text,
  comments) gets a leading `'`, so a spreadsheet shows it instead of running it.
- An analysis the engine could not run (page blocking the injection) is shown with its warning
  but no longer stored in the history as if every criterion were "not tested".
- The engine can no longer send a request of its own from the page: anything it asks for that the
  background did not fetch fails.
- **Keyboard and screen-reader access to the panel.** A criterion's detail opens from the
  keyboard (its description is a button); the status buttons, the feedback row actions and the
  status icons have spoken names; the tabs move with the arrow keys; the detail keeps the focus
  while open and gives it back on close; the end of an analysis is announced. The options page
  keeps AA contrast in light and dark mode.
- **Turning feedback participation off keeps your feedbacks reachable.** The Feedbacks tab stays
  while some remain, so they can still be exported or deleted, and both the tab and the options
  page say why.
- The feedback e-mail draft no longer carries the browser's user agent, nor the query string or
  fragment of page addresses.
- **The page's own headers are read again.** Since the reload mode went away, the ten rules on
  the page's response headers (CSP, X-Frame-Options, Referrer-Policy, nosniff, XSS protection,
  Content-Type, charset, UTF-8, server version, HTTPS everywhere) always answered "to check". The
  background now fetches the page once more, headers only, with its cookies and without
  following a redirect (see PRIVACY.md).
- **Engine overlay 0.8.0** — more accurate V5 rules:
  - zoom: `maximum-scale=10` or `1.5` no longer counts as blocking, a scale below 1 does, in any
    case and with `;` separators;
  - XSS protection: a CSP that restricts scripts counts (browsers have dropped
    X-XSS-Protection); `X-XSS-Protection: 0` alone does not;
  - Subresource Integrity: only resources from another site, protocol-relative included;
  - active navigation item: `inactive` is not active, and a menu inside a navigation is reported
    once; copy blocking: only `user-select: none`;
  - Unicode styling: fullwidth letters and digits only, not the punctuation of Chinese and
    Japanese, and not on pages in those languages;
  - dates: phone numbers and version numbers are not dates, and a date beside a link is found;
  - phone numbers with a country code, English terms of use and copyright wording, absolute and
    protocol-relative links, `srcset` and `poster` for mixed content, `autocomplete="off"` and
    `name="user[email]"` for autofill, any case for `kind` and `http://` form actions;
  - headers read whatever their case, a quoted charset, `zstd`; HTTPS, gzip and cache details
    name the resource at fault;
  - the 404 page's navigation is no longer found in `class="canvas"`;
  - duplicate ids and phone numbers no longer slow large pages down.
- The overlay is MPL-2.0, © Opquast 2026 (it was stamped with the engine's Temesis notice).
- jQuery Migrate ships exactly as published (the line added to mute it was redundant).
- The Chrome manifest no longer carries Firefox's settings; the options page opens in a tab, as
  intended.

### Removed

- **`web_accessible_resources`**: the engine and checklist files were readable by every site,
  which let any page detect the extension. Nothing needed them.
- **The `webRequest` permission**, with the "Analyze + reload" mode it served:
  that mode had no button left. The analysis reads the page's resources by
  re-fetching them, as before.
- Leftovers of the retired checklists: the "legacy" flag, about a hundred
  unused interface strings inherited from Opquast Desktop, unused CSS.

### Fixed

- A page resource that never answers no longer holds the analysis: it is given up after 10
  seconds. Images announced as too large are no longer downloaded. The same goes for the
  site-root probes, whose time limit now covers the body (5 seconds).
- Editing the comment of a feedback no longer erases its kind (confirm, refute…).
- Re-testing one criterion keeps your manual changes on the others in the global score. When the
  engine cannot run, the criterion keeps its result and your change instead of turning "not
  tested".
- `localhost.` and `*.local.` (with a final dot), and the shared, benchmarking and multicast
  address ranges, count as local addresses.
- Replacing a feedback saves the new one before deleting the old one.
- With several checklists enabled, the panel no longer switches to another checklist after an
  analysis; choosing a checklist in the toolbar shows its own results instead of relabelling the
  previous ones.
- Navigating during an analysis analyses the new page, instead of showing the previous page's
  result once it arrives.
- A failed side action (re-testing a criterion, saving a change) no longer wipes the results
  table, and the re-test button no longer stays on "Running…".
- In a criterion's detail, the arrow keys no longer jump to another criterion while you type a
  comment, and Escape on a confirmation no longer closes the detail behind it. A feedback being
  written is no longer cleared when it was not saved.
- A change to a criterion's comment alone, or to a manual criterion, can be undone.
- The options page no longer overwrites the checklist or language chosen in the panel.
- "Choose checklists" comes back after an access error. The search also matches the criterion
  number shown in the table.
- Texts: the app feedback note names the real button; the "not tested" note no longer points to
  a setting that does not exist; the options page title and the licence link follow the
  language.
- The table message shown when an analysis fails spans the whole table.
- Replacing an existing feedback asks for confirmation inside the panel; the
  browser's own dialog is often suppressed in DevTools.

### Internal

- CI and the pre-push hook generate the assets before type-checking and testing (a fresh clone
  failed before), and CI runs the engine's golden baseline.
- The sources archive for AMO holds what rebuilds the add-on and nothing else (183 files instead
  of 19,458: no engine tests, no build output, no untracked files), and rebuilds it identically
  even when unzipped inside another git repository.
- The rule dependency catalogue follows helper functions: the header rules are now listed as
  needing resources, and a pure-DOM rule no longer is. Tested, as are the build's guards (overlay
  edits, missing engine pin) and 37 new V5 corpus cases.
- `.gitattributes` keeps the overlay in LF, whose hash the build checks; the checklist scripts
  validate before writing.

- One engine pipeline shared by the full analysis and the single-criterion
  re-run; a single IndexedDB request helper; one override merge.
- Continuous integration on GitHub Actions (type-check, lint, format, unit
  tests, Chrome and Firefox builds, end-to-end suite).
- The engine submodule is fetched from github.com/Opquast/opquast-test-runner.

## Before 0.7.0

Versions 0.5.1 to 0.6.6 were published on the Chrome Web Store and Firefox
Add-ons from a private repository. In short:

- **0.6.6** (2026-10-07) — Explains why a page cannot be analysed (missing
  permission, private window, page no extension may reach); waits for the page
  to finish loading before analysing; automatic launch works in Chrome; options
  page shows and requests site access; end-to-end tests in Chrome and Firefox;
  the Firefox sources archive builds again.
- **0.6.5** (2026-09-08) — Verdict semantics: an absent object yields "not
  applicable" instead of "compliant" (engine overlay 0.7.0). Inline explanation
  of permission errors. Two test mappings corrected (FAVICON/APPLET, HSTS).
- **0.6.0** (2026-09-06) — Each analysis and feedback records the engine that
  produced it. Feedback participation becomes opt-in. Simplified criterion
  detail.
- **0.5.6** (2026-08-24) — CSS quality rules work on cross-origin stylesheets;
  the feedback e-mail opens in Chrome.
- **0.5.5** (2026-08-01) — Store resubmission, no functional change.
- **0.5.4** (2026-07-31) — Dark mode; clickable score counters; acknowledgments.
- **0.5.2, 0.5.3** (2026-07-20) — Firefox and Chrome Web Store packaging fixes.
- **0.5.1** (2026-07-20) — First release: the Opquast V5 engine in a DevTools
  panel for Chrome and Firefox (Manifest V3), with Opquast Basics and Opquast
  V5, scores, per-criterion detail, manual overrides, feedback journal and CSV
  export, all data kept on the device.

[0.7.1]: https://github.com/opquast-oss/opquast-devtools/releases/tag/v0.7.1
[0.7.0]: https://github.com/opquast-oss/opquast-devtools/releases/tag/v0.7.0

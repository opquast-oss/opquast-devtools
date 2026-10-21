# End-to-end tests (Chrome + Firefox)

Runs **the built extension** in real browsers, headless: installation, options page, analysis of
a page served over http, panel rendering. Produces screenshots and a report.

```bash
npm run e2e                                # builds both targets, then runs Chrome and Firefox
node test/e2e/run.mjs --browser=chrome     # reuses the build already in .output/
node test/e2e/run.mjs --browser=firefox
```

Results go to `test/e2e/out/`: `report.md` and one screenshot per step (`out/<browser>/`).
The script exits with an error if a scenario fails.

## Scenarios

| Scenario | What is checked |
| --- | --- |
| `install` | manifest version = `package.json`, the background answers on the `oqs-panel` port |
| `config-defaults` | fresh profile: only Opquast Basics enabled and selected, site access granted |
| `inspect-basics` | automatic analysis, scores, Results table, criterion detail, "Relaunch" |
| `inspect-while-loading` | analysis started while the page loads (`/slow`, delayed response): same score as the loaded page |
| `config-v5` | V5 ticked in the options → present in the panel's scores (then unticked) |
| `devtools-real` | Chrome only: the real panel in the real DevTools (shipped build, no stub) — analysis starts on its own when the panel opens, `about:blank` → "This page cannot be analysed" |
| `access-restricted` | `about:blank` → "This page cannot be analysed", and the Results table says so |
| `access-denied` | Firefox only: `<all_urls>` permission removed → "Permission needed", the browser's message, the options page |

Labels are checked against `src/lib/ui-strings.ts`, not copied.

## How the panel is tested

No browser lets you drive a DevTools panel headless, and Firefox does not allow it at all. The
harness therefore opens `panel.html` in a regular tab. `prepare.mjs` copies the build into
`test/e2e/.build/` and loads `devtools-stub.js` before the panel. The stub provides
`devtools.inspectedWindow` (inspected tab, `eval`) and `devtools.network`. Everything else is the
real extension: background, engine, storage, rendering. The shipped build is not modified.

The stub reproduces the shape of `inspectedWindow.eval` in each browser: a promise in Firefox,
`null` and a callback in Chrome.

In Chrome, the `devtools-real` scenario also tests **the real panel in the real DevTools**
(`devtools-chrome.mjs`). Chrome starts with `--auto-open-devtools-for-tabs` and a CDP port, then
the Opquast tab is selected through the DevTools UI itself. Firefox does not allow this kind of
control: its panel is only tested through the stub.

## Requirements

- **Chrome**: Playwright's Chromium (`npx playwright install chromium`). On Debian/Ubuntu, the
  `libnss3` and `libnspr4` libraries (`sudo npx playwright install-deps chromium`).
- **Firefox**: downloaded automatically on first run, with geckodriver, into
  `~/.cache/opquast-e2e/` (Linux x64 or arm64). To use others:
  `FIREFOX_BIN=… GECKODRIVER_BIN=… node test/e2e/run.mjs`.

## Firefox specifics

- Driven by Selenium + geckodriver (Marionette). WebDriver BiDi, and therefore Puppeteer, cannot
  reach `moz-extension://` pages.
- Firefox starts with `-remote-allow-system-access`. Without it, its remote agent refuses
  extension pages too.
- The `moz-extension://` UUID is fixed by the `extensions.webextensions.uuids` preference.
- Site access is granted at install time by `extensions.originControls.grantByDefault`, as a user
  accepting it would.

# Opquast DevTools

Opquast web quality checks, right inside the browser DevTools — for **Chrome** and **Firefox**
(Manifest V3).

Open the developer tools on any page, pick the **Opquast** tab, and the extension runs the
[Opquast](https://www.opquast.com) rules against the inspected page: a score, a verdict per
criterion, the elements concerned (highlighted in the page), and room for your own notes and
corrections. Everything stays on your device.

It carries on [Opquast Desktop](https://github.com/opquast-oss/opquast-desktop), the Firefox add-on
Opquast built around 2013, and runs the same analysis engine,
[opquast-test-runner](https://github.com/opquast-oss/opquast-test-runner).

## Features

- **Two checklists**: _Opquast Basics_ (65 criteria, the default) and _Web Quality — Opquast V5_
  (245 criteria). Every enabled checklist is analysed in one pass.
- **Scores** per checklist, and a **Results** table you can filter, search and sort.
- **Criterion detail**: how it was tested, the occurrences found (inspect or highlight them in the
  page), a link to the criterion on [checklists.opquast.com](https://checklists.opquast.com/).
- **Manual review**: change a verdict, add a note, re-run a single criterion. Your changes are kept
  per page.
- **History**: analyses are stored locally; with automatic launch off, the last one is shown again
  when you come back to a page.
- **CSV export** of the results.
- **Optional feedback journal**: record remarks on verdicts and send them to Opquast by e-mail,
  from your own mail client, if you choose to.
- **French and English** interface.

108 of the 245 V5 criteria are checked automatically (35 of the 65 Basics); the others are shown
as "not tested" and left to human review. See [`docs/checklists.md`](docs/checklists.md).

## Install

The extension is published on the Chrome Web Store and on Firefox Add-ons (AMO).

To run it from source instead, see [Develop](#develop) and
[Load the extension](#load-the-extension).

## Privacy

No account, no telemetry, no analytics. Results, notes and preferences are stored in the
browser. The extension only talks to the page you inspect, to the resources that page loads, and
to a few files at the root of its site (`robots.txt`, `sitemap.xml`…). See
[`PRIVACY.md`](PRIVACY.md) and [`PERMISSIONS.md`](PERMISSIONS.md).

## Develop

Requirements: Node.js 22 and git.

```bash
git clone --recurse-submodules https://github.com/opquast-oss/opquast-devtools.git
cd opquast-devtools
npm ci

npm run dev            # Chrome, with hot reload
npm run dev:firefox    # Firefox, with hot reload
```

`npm run dev` starts WXT, which opens a browser with the extension loaded and reloads it on
every change, together with a watcher that regenerates the assets when `data/` changes. Open
the DevTools (F12) and pick the **Opquast** tab.

| Command | What it does |
| --- | --- |
| `npm run build` / `build:firefox` | Build into `.output/chrome-mv3` / `.output/firefox-mv3` |
| `npm run zip` / `zip:firefox` | Package for the Chrome Web Store / AMO (with the sources archive) |
| `npm run compile` | Type-check (`tsc --noEmit`, strict) |
| `npm run lint` / `format` | ESLint / Prettier |
| `npm test` | Unit tests (Vitest) |
| `npm run e2e` | Build, then run the extension in headless Chrome and Firefox ([details](test/e2e/README.md)) |
| `npm run golden:v5` | Engine regression check against a recorded baseline ([details](test/golden/README.md)) |
| `npm run test:v5` | Run the V5 rules against their test pages |
| `npm run test:basics` | Check that Opquast Basics is a subset of V5 |
| `npm run sync-assets` | Regenerate `public/` from the engine and `data/` (done by every build) |

An optional pre-push hook runs the type-check, lint, format check and unit tests:
`git config core.hooksPath .githooks`.

### Load the extension

After `npm run build` (or `build:firefox`):

- **Chrome**: `chrome://extensions` → Developer mode → _Load unpacked_ → `.output/chrome-mv3`.
- **Firefox**: `about:debugging` → This Firefox → _Load Temporary Add-on_ →
  `.output/firefox-mv3/manifest.json`.

Then open the DevTools on any web page and pick the **Opquast** tab.

## How it works

```
packages/opquast-test-runner/   analysis engine (git submodule, not modified here)
data/checklists/{en,fr}/        checklist criteria
data/engine-overlay/            V5 rules added on top of the engine
data/test-descriptions/         one sentence per engine test, in French and English
scripts/sync-assets.mjs         assembles public/ from all of the above at build time
src/entrypoints/                background, DevTools panel, options page
src/engine/                     runs the engine in the inspected page
src/recovery/                   gathers what the engine needs: page resources, site-root files
src/lib/                        storage, scoring, preferences, strings, messages
```

The panel asks the background to analyse the inspected tab. The background injects the engine
into the page's isolated world, gives it the page's resources (re-fetched from the background,
where the extension's host permission lifts CORS), runs the rules of the enabled checklists, and
stores one analysis per checklist. More in [`docs/architecture.md`](docs/architecture.md).

## History and credits

Opquast Desktop and its analysis engine were written and funded by Opquast, under the Temesis SAS
brand, between 2013 and 2016, in a project led by Elie Sloïm: Olivier Meunier, Fabrice Bonny,
Mickaël Hoareau and Samuel Martin built them, with Laurent Jouanneau on the engine, Laurent Denis
for quality and accessibility expertise, and Muriel de Dona and Elie Sloïm for the user experience.
Éric Gateau and Aurélien Lévy, through their consulting and audit work, gave the team the means to
build the Opquast tools.

In 2026, Elie Sloïm took up that code again, prompted by Benjamin Hannache, and ported it to
today's browsers as this extension, with the help of Claude Code (see below).

## Contributing

Bug reports, test pages where a verdict is wrong, and pull requests are welcome. See
[`CONTRIBUTING.md`](CONTRIBUTING.md). To report a security issue, see [`SECURITY.md`](SECURITY.md).

This project is developed with heavy use of an AI coding assistant (Claude Code), under the
review and responsibility of a human maintainer.
[`CONTRIBUTING.md`](CONTRIBUTING.md#how-this-project-is-written) explains how, and what it
means for contributors.

## License

- **Extension code**: tri-licensed MPL-1.1 / GPL-2.0 / LGPL-2.1, like Opquast Desktop. See
  [`LICENSE`](LICENSE).
- **Analysis engine** (opquast-test-runner, Temesis SAS) and the V5 overlay: MPL-2.0.
- **Checklist content**: the Opquast referential, © Opquast, CC BY-SA 4.0 —
  _"Référentiel Opquast - Qualité Numérique" by Opquast, used under CC BY-SA 4.0._ See
  [`data/checklists/LICENSE`](data/checklists/LICENSE).
- **Bundled libraries**: jQuery and jQuery Migrate (MIT), JSCSSP `cssParser.js`
  (MPL-1.1 / GPL-2.0 / LGPL-2.1).

Full texts are in [`LICENSES/`](LICENSES/); the attribution notice is
[`THIRD-PARTY.md`](THIRD-PARTY.md).

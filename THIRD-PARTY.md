# Third-party components

Opquast DevTools bundles and redistributes the third-party components listed
below. Each retains its own upstream license; the full license texts live under
[`LICENSES/`](LICENSES/). This file is the aggregated attribution notice for
store reviewers and downstream recipients.

The bundled engine libraries are copied into `public/engine/` at build time by
`scripts/sync-assets.mjs` (they are generated, not checked into git). jQuery,
jQuery Migrate and cssParser are copied byte-for-byte. The Temesis engine
libraries get an MPL-2.0 header banner at that copy step, since their source
files carry none; the overlay carries its own.

## Analysis engine — Opquast test runner

- **Files:** `public/engine/oqs-tests.js`, `oqs-utils.js`, `oqs-validator.js`
  (source: `packages/opquast-test-runner/data/lib/`).
- **Author / copyright:** Temesis SAS (https://www.temesis.com/).
- **License:** Mozilla Public License 2.0 — [`LICENSES/MPL-2.0.txt`](LICENSES/MPL-2.0.txt),
  and `packages/opquast-test-runner/LICENSE`.

## V5 engine overlay

- **Files:** `public/engine/oqs-tests-overlay.js`, and the overlay's rules merged into
  `rules.json` / `rulesets.json` (source: `data/engine-overlay/`).
- **Copyright:** Opquast, 2026. Written for this extension; it extends the engine above.
- **License:** Mozilla Public License 2.0 — [`LICENSES/MPL-2.0.txt`](LICENSES/MPL-2.0.txt).
  The notice is in the file.

## jQuery 3.7.1 + jQuery Migrate 3.5.2

- **Files:** `public/engine/jquery-3.7.1.min.js`, `public/engine/jquery-migrate-3.5.2.min.js`
  (vendored in the product repo under `data/vendor/`, copied at build time by `sync-assets.mjs`).
- **Copyright:** OpenJS Foundation and other contributors (jquery.org/license).
- **License:** MIT. Upstream banners are preserved in the files.
- jQuery Migrate restores the jQuery-1.x APIs the legacy Opquast engine still calls. This build
  mutes its deprecation warnings by default, so it ships unchanged.

## JSCSSP — cssParser.js

- **File:** `public/engine/cssParser.js`.
- **Origin:** Netscape / mozilla.org (JSCSSP).
- **License:** tri-license MPL-1.1 / GPL-2.0 / LGPL-2.1 —
  [`LICENSES/MPL-1.1.txt`](LICENSES/MPL-1.1.txt),
  [`LICENSES/GPL-2.0.txt`](LICENSES/GPL-2.0.txt),
  [`LICENSES/LGPL-2.1.txt`](LICENSES/LGPL-2.1.txt). The upstream
  `BEGIN LICENSE BLOCK` header is preserved in the file.

## Checklist content — Opquast referential

- **Files:** `data/checklists/**`, `public/checklists/**`.
- **Copyright:** Opquast.
- **License:** Creative Commons Attribution-ShareAlike 4.0 International
  (CC BY-SA 4.0) — [`LICENSES/CC-BY-SA-4.0.txt`](LICENSES/CC-BY-SA-4.0.txt).
  Attribution: *"Référentiel Opquast - Qualité Numérique" by Opquast, used under
  CC BY-SA 4.0.* See `data/checklists/LICENSE`.

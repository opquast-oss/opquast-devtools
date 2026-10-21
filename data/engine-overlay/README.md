# Engine overlay — Opquast V5 automation

New automated tests for the **Opquast V5** checklist live here, in the product repo, so the
vendored engine (`packages/opquast-test-runner`) stays **pristine** (its committed source is
never edited). The overlay is merged into the generated engine at build time.

## Files

| File | Merged into | By |
|---|---|---|
| `rulesets-overlay.json` | `public/engine/rulesets.json` (keyed by **V5 criterion id**, e.g. `54513`) | `scripts/sync-assets.mjs` |
| `rules-overlay.json` | `public/engine/rules.json` (new `xpath@`/`regexp@`/`oqs@` expressions) | `scripts/sync-assets.mjs` |
| `oqs-tests-overlay.js` | `public/engine/oqs-tests-overlay.js` (injected after `oqs-tests.js`) | `scripts/sync-assets.mjs` + `src/lib/engine-assets.ts` |
| `overlay.json` | nothing — it *identifies* the three files above | read by `checkOverlayVersion()` |

## Adding a rule

1. Find the V5 criterion **id** (5-digit, e.g. `54513`) in `data/checklists/fr/900-opquast-v5.json`
   and read the criterion on [checklists.opquast.com](https://checklists.opquast.com/) to confirm
   its intent. `data/v5-automation-triage.json` records, for every V5 rule, whether it can be
   automated, how, and which existing rules it can reuse.
2. **Reuse first**: if `public/engine/rules.json` already has a suitable expression (see the
   triage `reuse` column), you only add a ruleset chain to `rulesets-overlay.json`.
   Prefer copying a **proven chain** already present in `rulesets-overlay.json` over
   inventing one.
3. If a new check is needed, add the expression to `rules-overlay.json`
   (`"MY_RULE": "xpath@html://…"` or `"oqs@html:myFn"`) and, for `oqs@`, the function to
   `oqs-tests-overlay.js`.
4. Ruleset verdicts: chain to `c`/`nc` for full-auto, or terminate in `i` (+ details) for
   semi-automatic (engine flags candidates, human decides).
5. **Bump the overlay version.** In `overlay.json`, raise `version` (semver: a rule removed or a
   verdict policy reversed is a major; a changed verdict or a new rule is a minor; a fix that
   changes no verdict is a patch). Leave `contentHash` alone for now. The overlay's version is its
   own: it does not follow the extension's.
6. Regenerate + verify:
   ```bash
   npm run sync-assets             # → public/engine/*  (merges the overlay, parse-checks the JS)
   npm run test && npm run compile
   ```
   The first `sync-assets` **will fail**, printing the new `contentHash`. Paste it into `overlay.json`
   and run again. That is the point: the version cannot be forgotten, because the build stops
   until it is updated. It is what lets a verdict be traced back to the overlay that produced it,
   so a stale number is worse than none.

   (`npm run dev` allows the drift — `ALLOW_OVERLAY_DRIFT=1`, for the watcher and for WXT's build
   hook — and stamps the overlay `<version>+dev`: the guard is a release gate, not something that
   fires on every keystroke.)
   Then, on a machine with a browser: add a case per changed behaviour to `test/v5/cases.json`
   and run `npm run test:v5`, then `npm run golden:v5` (`:update` only when a pilot verdict was
   meant to change) and the end-to-end suite. `public/engine/*` is generated — never edit it by
   hand.
7. The overlay is MPL-2.0, © Opquast: keep the notice at the top of `oqs-tests-overlay.js`.

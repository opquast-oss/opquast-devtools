# Golden-master gate (V5 engine regression safety net)

Runs the Opquast engine (+ V5 overlay) in a real headless Chromium against recorded fixtures and
asserts the output is **identical** to a baseline. Use it to prove that engine/overlay changes alter
**no behaviour** on the pilot V5 criteria.

> ⚠️ Needs a working local browser (Playwright). Runs anywhere one is installed, dev container
> after `npx playwright install chromium` + `sudo npx playwright install-deps chromium`.

## Usage

```bash
npm run sync-assets                  # populate public/engine

npm run golden:v5:update             # record the baseline with the CURRENT engine
npm run golden:v5                    # exits non-zero + prints a diff on any regression
```

The fixture and a fixed sidecar (resources / events / XHR bodies) live in `golden-v5.mjs`;
`baseline-v5.json` is the recorded reference (8 pilot V5 criteria — commit it once stable). Extend
the corpus by adding fixtures — especially pages that hit the `xpath@` / `oqs@` / `regexp@` schemes.

> The legacy V3 golden (`golden.mjs` / `baseline.json`, keyed on the retired Qualité Web V3 /
> 742-website referentials) was removed when those referentials were retired.

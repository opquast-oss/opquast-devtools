# Releasing

How a version goes to the Chrome Web Store and to Firefox Add-ons (AMO).

## 1. Prepare

1. Update `version` in `package.json` (the manifest takes it from there), then `npm install` to
   update `package-lock.json`.
2. Date the version's entry in `CHANGELOG.md`.
3. If the overlay changed, its own version in `data/engine-overlay/overlay.json` must have been
   bumped already. The build refuses to run until `overlay.json` records the overlay's new hash;
   it cannot tell whether `version` moved with it, so check that it did.

## 2. Check

```bash
npm ci
npm run sync-assets        # generated files; checks the engine pin and the overlay version
npm run compile && npm run lint && npm run format:check && npm test
npm run test:basics
npm run golden:v5          # engine regression baseline
npm run test:v5            # the V5 corpus: compare the failures with the previous release's
npm run e2e                # builds both targets, runs Chrome and Firefox
```

Then by hand, in Chrome and in Firefox: analyse a real site and a local page, switch the language
of the panel and of the options page, export a CSV, re-run a criterion, and analyse again after
the background has been idle for more than 30 seconds.

## 3. Package

```bash
npm run zip            # .output/opquast-devtools-<version>-chrome.zip
npm run zip:firefox    # .output/opquast-devtools-<version>-firefox.zip
                       # .output/opquast-devtools-<version>-sources.zip (for AMO reviewers)
```

Check the packages:

- the manifests request `scripting`, `activeTab`, `storage`, `unlimitedStorage` and the
  `<all_urls>` host permission — nothing else (see `PERMISSIONS.md`);
- the engine files in `public/engine/` carry their license headers (MPL-2.0 for `oqs-*.js`), and
  the two jQuery files are identical to the ones published on code.jquery.com;
- the sources archive builds an identical add-on without git: unzip it in an empty directory,
  then `npm ci && npm run build:firefox`, and compare with `.output/firefox-mv3`. Without a git
  checkout, `sync-assets` takes the engine commit from `scripts/submodule-pins.json`.

Copy the three archives into `dist/` (ignored by git) with their checksums:

```bash
mkdir -p dist && cp .output/opquast-devtools-*-{chrome,firefox,sources}.zip dist/
(cd dist && sha256sum opquast-devtools-<version>-*.zip > opquast-devtools-<version>.sha256)
```

## 4. Publish

- **Chrome Web Store**: upload the Chrome zip. Data disclosure: no data collected.
- **AMO**: upload the Firefox zip, and the sources zip when asked for the source code. The build
  instructions for reviewers are the commands above.
- **GitHub**: tag `v<version>`, push the tag, and create a release with the three archives and
  the changelog entry. Before that, the engine commit pinned in `scripts/submodule-pins.json` must
  be on github.com/Opquast/opquast-test-runner (see below).

## Updating the engine

The engine is the `packages/opquast-test-runner` submodule. To move it:

```bash
git -C packages/opquast-test-runner fetch
git -C packages/opquast-test-runner checkout <commit>
# record the new commit on purpose — the build refuses an unrecorded change
node -e "const f='scripts/submodule-pins.json';const p=require('./'+f);p['opquast-test-runner']=require('child_process').execSync('git -C packages/opquast-test-runner rev-parse HEAD').toString().trim();require('fs').writeFileSync(f,JSON.stringify(p,null,2)+'\n')"
npm run sync-assets && npm run golden:v5
```

The commit must be reachable from the public engine repository, or nobody else can build.

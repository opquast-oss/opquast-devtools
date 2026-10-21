// Build step: copy the PORTABLE parts out of the pristine submodules into the extension.
// Never writes into packages/. Reproducible — outputs are gitignored.
//
//   0. submodule SHA pin check          (fails on accidental drift unless ALLOW_SUBMODULE_DRIFT=1)
//   0b. overlay version check           (fails on unrecorded overlay edits unless ALLOW_OVERLAY_DRIFT=1)
//   1. engine  -> public/engine/        (libraries copied as is, the Opquast libs with an MPL-2.0
//                                        banner; rules + rulesets merged with the overlay)
//   2. checklists -> public/checklists/ (+ index.json of available languages per checklist)
//   3. locales -> public/_locales/{en,fr}/messages.json  (store listing name + description)
//      test descriptions -> public/test-descriptions/{en,fr}.json
//   4. rule-deps.generated.ts           (which rules/rulesets depend on events / resources)
//   5. engine-version.generated.ts      (the fingerprint of what public/engine/ ships)

import { execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OTR = join(ROOT, 'packages/opquast-test-runner');
// Checklists + locales are vendored in-repo (extracted from the now-archived opquast-desktop).
const DATA = join(ROOT, 'data');
const PUBLIC = join(ROOT, 'public');
// V5 automation overlay (product repo): merged into the generated engine so the
// opquast-test-runner submodule stays pristine. See data/engine-overlay/README.md.
const OVERLAY = join(DATA, 'engine-overlay');
const OVERLAY_LIB = 'oqs-tests-overlay.js';
const log = (...a) => console.log('[sync-assets]', ...a);

function readOverlayJson(name) {
  const p = join(OVERLAY, name);
  return existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : {};
}

/**
 * The V5 rulesets: the hand-authored overlay with the Opquast verdict policy.
 *
 * Verdict semantics (v0.7.0+):
 *   - Object ABSENT from page → "na" (Non Applicable)
 *   - Object PRESENT and CORRECT → "c" (Conforme)
 *
 * Consumed both for shipping public/engine/rulesets.json and for the rule-deps catalogue.
 */
function loadOverlayRulesets() {
  return readOverlayJson('rulesets-overlay.json');
}

/** Pristine engine rules + V5 overlay rules (the overlay wins on key collisions). */
function loadMergedRules() {
  return {
    ...JSON.parse(readFileSync(join(OTR, 'data/rules.json'), 'utf8')),
    ...readOverlayJson('rules-overlay.json'),
  };
}

function ensureClean(dir) {
  if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
}

// ---------------------------------------------------------------------------
// 0. Submodule SHA pin check
// ---------------------------------------------------------------------------
const PINS_FILE = join(ROOT, 'scripts/submodule-pins.json');

/**
 * HEAD of the checkout at `dir`, or null when `dir` is not itself a git checkout (the AMO sources
 * archive). Git walks up to any enclosing repository — a reviewer may unzip the archive inside one,
 * and a clone without --recurse-submodules leaves an empty directory inside ours — so a HEAD only
 * counts when `dir` is the top of its own working tree.
 */
function gitHead(dir) {
  const git = (args) =>
    execSync(`git ${args}`, { cwd: dir, stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
  try {
    if (resolve(git('rev-parse --show-toplevel')) !== resolve(dir)) return null;
    return git('rev-parse HEAD');
  } catch {
    return null;
  }
}

/** The submodule commit: checked out if there is a checkout, else the pinned one. A sources
 *  archive is packaged from a checkout that passed checkPins(), so the pin IS the code it holds. */
function otrCommit() {
  const head = gitHead(OTR);
  if (head) return head;
  return readPins()['opquast-test-runner'];
}

/** The recorded pins; a missing or incomplete file is an error, never something to fill in. */
function readPins() {
  if (!existsSync(PINS_FILE)) {
    throw new Error(`missing ${PINS_FILE}: record the submodule commit (see docs/releasing.md)`);
  }
  const pins = JSON.parse(readFileSync(PINS_FILE, 'utf8'));
  if (typeof pins['opquast-test-runner'] !== 'string') {
    throw new Error(`${PINS_FILE} has no "opquast-test-runner" commit`);
  }
  return pins;
}

function checkPins() {
  // Read first: a deleted or emptied pins file must stop the build, not switch the guard off.
  const pinned = readPins();
  if (!gitHead(OTR)) {
    log('no git checkout (sources archive): submodule taken as pinned in submodule-pins.json');
    return;
  }
  const current = {
    'opquast-test-runner': gitHead(OTR),
  };
  for (const [name, want] of Object.entries(pinned)) {
    if (!(name in current)) throw new Error(`${PINS_FILE} pins an unknown submodule "${name}"`);
    if (current[name] !== want) {
      const msg = `submodule "${name}" drifted: pinned ${String(want).slice(0, 10)} but checked out ${current[name].slice(0, 10)}`;
      if (process.env.ALLOW_SUBMODULE_DRIFT === '1') {
        log('WARN', msg, '(allowed)');
      } else {
        throw new Error(
          `${msg}\nUpdate scripts/submodule-pins.json intentionally, or run with ALLOW_SUBMODULE_DRIFT=1.`,
        );
      }
    }
  }
  log('submodule pins OK');
}

// ---------------------------------------------------------------------------
// 0b. Overlay version
// ---------------------------------------------------------------------------
// The overlay is product-side code that ships inside the engine, and it had no version at all:
// its rules, rulesets and 40 functions could change without anything saying so. A number nobody is
// forced to bump is a number nobody bumps, so this mirrors checkPins() — edit the overlay without
// bumping `version`, and the build stops.
//
// The hash is taken on the SOURCES because the question is "did a human change the overlay",
// not "did the build produce something else".
const OVERLAY_SOURCES = ['rules-overlay.json', 'rulesets-overlay.json', OVERLAY_LIB];
const OVERLAY_META = 'overlay.json';

const sha256hex = (buf) => createHash('sha256').update(buf).digest('hex');

/** sha256 over "<name> <sha>" lines, sorted by name — order-independent, and legible when it fails. */
function hashFiles(dir, names) {
  const manifest = [...names]
    .sort()
    .map((n) => `${n} ${sha256hex(readFileSync(join(dir, n)))}`)
    .join('\n');
  return sha256hex(manifest);
}

function checkOverlayVersion() {
  const metaFile = join(OVERLAY, OVERLAY_META);
  const current = hashFiles(OVERLAY, OVERLAY_SOURCES);
  if (!existsSync(metaFile)) {
    throw new Error(
      `missing ${OVERLAY_META} — create it with "version" and "contentHash": "${current}"`,
    );
  }
  const meta = JSON.parse(readFileSync(metaFile, 'utf8'));
  if (meta.contentHash !== current) {
    const msg =
      `overlay sources changed but ${OVERLAY_META} still announces ${meta.version}\n` +
      `  bump "version" and set "contentHash": "${current}"`;
    if (process.env.ALLOW_OVERLAY_DRIFT === '1') {
      log('WARN', msg.split('\n')[0], '(allowed)');
      // Say it in the stamp too: these verdicts come from no released overlay version.
      return { ...meta, version: `${meta.version}+dev` };
    }
    throw new Error(`${msg}\n  (or run with ALLOW_OVERLAY_DRIFT=1)`);
  }
  if (typeof meta.version !== 'string') throw new Error(`${OVERLAY_META} has no "version"`);
  log(`overlay ${meta.version} OK`);
  return meta;
}

// ---------------------------------------------------------------------------
// 5. Engine version stamp
// ---------------------------------------------------------------------------
// What identifies "the engine that produced this verdict". Three moving parts that can move
// independently — the submodule, the overlay, and the vendored jQuery — so a single number would
// lie. The fingerprint covers all of it.
//
// It is taken over public/engine/ AFTER copyEngine(), i.e. after the MPL banners and the rule merge
// + filter. That is literally the bytes that reach
// the page: if one changes, the fingerprint changes; if none does, it does not.
//
// No timestamp on purpose — it would make every regen irreproducible for no gain. The fingerprint
// IS the build's identity.
function generateEngineVersion(overlayMeta) {
  const dst = join(PUBLIC, 'engine');
  const expected = [...VENDOR_LIBS, ...OTR_LIBS, OVERLAY_LIB, 'rules.json', 'rulesets.json'];
  const actual = readdirSync(dst);

  // sync-assets is .mjs and cannot import ENGINE_FILES from TypeScript, so this list is a de facto
  // duplicate of src/lib/engine-assets.ts. Left unchecked, a lib added upstream would ship without
  // ever entering the fingerprint — silently outside the thing meant to identify it.
  const missing = expected.filter((f) => !actual.includes(f));
  const extra = actual.filter((f) => !expected.includes(f));
  if (missing.length || extra.length) {
    throw new Error(
      `public/engine does not match the fingerprint list.\n` +
        `  missing: ${missing.join(', ') || 'none'}\n  unexpected: ${extra.join(', ') || 'none'}\n` +
        `  Update OTR_LIBS/VENDOR_LIBS here AND ENGINE_FILES in src/lib/engine-assets.ts.`,
    );
  }

  const fullHash = hashFiles(dst, expected);
  const engine = JSON.parse(readFileSync(join(OTR, 'package.json'), 'utf8')).version;
  const submodule = otrCommit().slice(0, 10);

  const body =
    `// AUTO-GENERATED by scripts/sync-assets.mjs — do not edit.\n` +
    `//\n` +
    `// Identifies the engine that produced a verdict. \`hash\` covers the ${expected.length} files actually\n` +
    `// shipped in public/engine/, after every build transformation.\n\n` +
    `export const ENGINE_VERSION = {\n` +
    `  engine: ${JSON.stringify(engine)},\n` +
    `  submodule: ${JSON.stringify(submodule)},\n` +
    `  overlay: ${JSON.stringify(overlayMeta.version)},\n` +
    `  hash: ${JSON.stringify(fullHash.slice(0, 6))},\n` +
    `  fullHash: ${JSON.stringify(fullHash)},\n` +
    `} as const;\n`;

  const outDir = join(ROOT, 'src/engine');
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'engine-version.generated.ts'), body);
  log(`engine version: ${engine} · overlay ${overlayMeta.version} · ${fullHash.slice(0, 6)}`);
}

// ---------------------------------------------------------------------------
// 1. Engine (verbatim)
// ---------------------------------------------------------------------------
// Engine libs copied verbatim from the pristine submodule (packages/opquast-test-runner/data/lib).
const OTR_LIBS = ['cssParser.js', 'oqs-utils.js', 'oqs-validator.js', 'oqs-tests.js'];
// jQuery is vendored in the PRODUCT repo (data/vendor), not the submodule: AMO bans jQuery 1.9.1
// (the version the submodule ships), so we substitute jQuery 3.7.1 + jQuery Migrate 3.x, which
// restores the jQuery-1.x APIs the legacy engine still calls (.size(), ajax .success/.error…).
const VENDOR = join(DATA, 'vendor');
// Both are shipped exactly as published (stores recognise known libraries by their hash). Migrate
// 3.5.x already mutes its warnings by default, so nothing needs adding to it.
const VENDOR_LIBS = ['jquery-3.7.1.min.js', 'jquery-migrate-3.5.2.min.js'];

// The engine libs ship without a per-file license header. Their upstream project
// (@opquast/test-runner, Temesis SAS) is MPL-2.0; we stamp the MPL-2.0 "Exhibit A" notice at copy
// time so the distributed engine carries the required notice (jquery/cssParser keep their own).
// The overlay is not stamped: it carries its own notice (Opquast, 2026).
const MPL2_STAMPED = ['oqs-utils.js', 'oqs-validator.js', 'oqs-tests.js'];
const MPL2_BANNER =
  '/*\n' +
  ' * Opquast web quality test engine\n' +
  ' * Copyright (c) Temesis SAS (https://www.temesis.com/)\n' +
  ' *\n' +
  ' * This Source Code Form is subject to the terms of the Mozilla Public License,\n' +
  ' * v. 2.0. If a copy of the MPL was not distributed with this file, You can obtain\n' +
  ' * one at https://mozilla.org/MPL/2.0/.\n' +
  ' *\n' +
  ' * SPDX-License-Identifier: MPL-2.0\n' +
  ' */\n';

function copyEngine() {
  const dst = join(PUBLIC, 'engine');
  ensureClean(dst);
  for (const f of VENDOR_LIBS) cpSync(join(VENDOR, f), join(dst, f));
  for (const f of OTR_LIBS) cpSync(join(OTR, 'data/lib', f), join(dst, f));

  // rules.json = pristine engine rules + V5 overlay expressions (new checks live in
  // the product repo, not the submodule). Overlay wins on key collisions. The engine only looks a
  // rule up by the keys of a ruleset tree (oqs-validator.js loop_over_tests / chain), so the rules
  // no V5 ruleset references — most of the submodule's, written for retired checklists — are dropped.
  const rulesOverlay = readOverlayJson('rules-overlay.json');
  const mergedRules = loadMergedRules();
  const rulesets = loadOverlayRulesets();
  const referenced = new Set();
  collectKeys(rulesets, referenced);
  const shippedRules = Object.fromEntries(
    Object.entries(mergedRules).filter(([id]) => referenced.has(id)),
  );
  writeFileSync(join(dst, 'rules.json'), JSON.stringify(shippedRules));

  // V5 rulesets: the overlay with the verdict policy applied (keyed by V5 criterion id).
  writeFileSync(join(dst, 'rulesets.json'), JSON.stringify(rulesets));

  // V5 overlay oqs@ functions — injected after oqs-tests.js (see src/lib/engine-assets.ts).
  cpSync(join(OVERLAY, OVERLAY_LIB), join(dst, OVERLAY_LIB));

  // Stamp the MPL-2.0 notice on the engine libs (idempotent: skip if already present).
  if (!readFileSync(join(dst, OVERLAY_LIB), 'utf8').includes('SPDX-License-Identifier: MPL-2.0')) {
    throw new Error(`${OVERLAY_LIB} lost its MPL-2.0 notice`);
  }
  for (const f of MPL2_STAMPED) {
    const p = join(dst, f);
    const body = readFileSync(p, 'utf8');
    if (!body.includes('SPDX-License-Identifier: MPL-2.0')) {
      writeFileSync(p, MPL2_BANNER + body);
    }
  }

  // Gate: every engine .js (incl. the V5 overlay lib) must parse in V8.
  for (const f of [...VENDOR_LIBS, ...OTR_LIBS, OVERLAY_LIB]) {
    try {
      execSync(`node --check ${JSON.stringify(join(dst, f))}`, { stdio: 'pipe' });
    } catch (e) {
      throw new Error(`engine lib ${f} fails V8 parse after sync:\n${e.stderr?.toString() ?? e}`, {
        cause: e,
      });
    }
  }

  log(
    `engine: ${VENDOR_LIBS.length + OTR_LIBS.length} libs + ${OVERLAY_LIB} + rules.json ` +
      `(${Object.keys(shippedRules).length} of ${Object.keys(mergedRules).length} rules, ` +
      `${Object.keys(rulesOverlay).length} from the overlay) + rulesets.json; all parse-checked`,
  );
}

// ---------------------------------------------------------------------------
// 2. Checklists (+ language manifest)
// ---------------------------------------------------------------------------
// Display names, per language. The API names the V5 checklist in French whatever the language, so
// the English label is set here; anything not listed falls back to the name found in the data.
const CHECKLIST_NAMES = {
  '900-opquast-v5': { en: 'Web Quality - Opquast V5' },
};

// Fields to strip from criteria (premium content provided via API to partners).
const STRIPPED_FIELDS = ['goal', 'explanation', 'solution', 'control', 'vulgarization'];

function stripPremiumFields(data) {
  const stripped = {};
  for (const [id, criterion] of Object.entries(data)) {
    const clean = { ...criterion };
    for (const field of STRIPPED_FIELDS) delete clean[field];
    stripped[id] = clean;
  }
  return stripped;
}

function copyChecklists() {
  const srcRoot = join(DATA, 'checklists');
  const dst = join(PUBLIC, 'checklists');
  ensureClean(dst);
  // Language subdirectories only (ignore sibling files like LICENSE).
  const langs = readdirSync(srcRoot, { withFileTypes: true })
    .filter((e) => e.isDirectory() && readdirSync(join(srcRoot, e.name)).length)
    .map((e) => e.name);
  const bySlug = {};
  for (const lang of langs) {
    mkdirSync(join(dst, lang), { recursive: true });
    for (const file of readdirSync(join(srcRoot, lang))) {
      if (!file.endsWith('.json')) continue;
      // Read, strip premium fields, write (instead of verbatim copy).
      const data = JSON.parse(readFileSync(join(srcRoot, lang, file), 'utf8'));
      const stripped = stripPremiumFields(data);
      writeFileSync(join(dst, lang, file), JSON.stringify(stripped));
      const slug = file.replace(/\.json$/, '');
      bySlug[slug] ??= { slug, langs: [], names: {} };
      bySlug[slug].langs.push(lang);
      // Human name: the override if any, else the first criterion's checklist metadata.
      const first = Object.values(data)[0];
      bySlug[slug].names[lang] = CHECKLIST_NAMES[slug]?.[lang] ?? first?.checklist?.name ?? slug;
    }
  }
  // Curated display order (Basics first, then V5); any other referential falls back to alpha.
  const ORDER = ['901-opquast-basics', '900-opquast-v5'];
  const rank = (s) => {
    const i = ORDER.indexOf(s);
    return i === -1 ? ORDER.length : i;
  };
  const manifest = Object.values(bySlug).sort(
    (a, b) => rank(a.slug) - rank(b.slug) || a.slug.localeCompare(b.slug),
  );
  // NB: named index.json (not manifest.json) — the Chrome Web Store uploader rejects a package that
  // contains any second file named manifest.json besides the extension manifest.
  writeFileSync(join(dst, 'index.json'), JSON.stringify(manifest, null, 2) + '\n');
  log(`checklists: ${manifest.length} referentials across langs [${langs.join(', ')}]`);
}

// ---------------------------------------------------------------------------
// 3. Locales -> WebExtension _locales, and the test descriptions
// ---------------------------------------------------------------------------
// Extension "chrome" strings referenced by the manifest via __MSG_extName__ / __MSG_extDescription__.
// Per-locale so the store listing reads correctly in each language (default_locale is `en`).
// The panel's own strings live in src/lib/ui-strings.ts: they follow the language chosen in the
// panel, which browser.i18n (tied to the browser's locale) cannot do.
const EXT_CHROME = {
  en: {
    extName: 'Opquast DevTools',
    extDescription:
      'Run Opquast web quality & accessibility checks right inside the browser DevTools (Chrome + Firefox).',
  },
  fr: {
    extName: 'Opquast DevTools',
    extDescription:
      'Analyse qualité & accessibilité Opquast directement dans les DevTools (Chrome + Firefox).',
  },
};

function copyLocales() {
  const dst = join(PUBLIC, '_locales');
  ensureClean(dst);
  for (const [lang, strings] of Object.entries(EXT_CHROME)) {
    const messages = Object.fromEntries(
      Object.entries(strings).map(([k, message]) => [k, { message }]),
    );
    mkdirSync(join(dst, lang), { recursive: true });
    writeFileSync(join(dst, lang, 'messages.json'), JSON.stringify(messages, null, 2) + '\n');
  }
  log(`locales: ${Object.keys(EXT_CHROME).join(', ')}`);
}

// One plain-language sentence per engine test, shown in the criterion detail ("How it is tested").
// Only the tests that ship (see copyEngine) are kept.
function copyTestDescriptions() {
  const src = join(DATA, 'test-descriptions');
  const dst = join(PUBLIC, 'test-descriptions');
  ensureClean(dst);
  if (!existsSync(src)) throw new Error(`missing ${src} (the "How it is tested" texts)`);
  const shipped = JSON.parse(readFileSync(join(PUBLIC, 'engine/rules.json'), 'utf8'));
  for (const file of readdirSync(src).filter((f) => f.endsWith('.json'))) {
    const all = JSON.parse(readFileSync(join(src, file), 'utf8'));
    const kept = Object.fromEntries(
      Object.entries(all).filter(([test]) => Object.hasOwn(shipped, test)),
    );
    writeFileSync(join(dst, file), JSON.stringify(kept));
  }
  log(`test descriptions: ${readdirSync(dst).join(', ')}`);
}

// ---------------------------------------------------------------------------
// 4. Rule dependency catalogue (events / resources)
// ---------------------------------------------------------------------------
function collectKeys(node, out) {
  if (Array.isArray(node)) {
    for (const v of node) collectKeys(v, out);
  } else if (node && typeof node === 'object') {
    for (const [k, v] of Object.entries(node)) {
      out.add(k);
      collectKeys(v, out);
    }
  }
}

function generateRuleDeps() {
  const rules = loadMergedRules();
  // V5 is the only shipped engine: catalogue deps from the V5 rulesets so forcedNt applies to real
  // V5 criterion ids.
  const rulesets = loadOverlayRulesets();
  const ruleIds = new Set(Object.keys(rules));

  // funcName -> [ruleId] for the oqs@ scheme (the only scheme backed by JS functions).
  const funcToRules = {};
  for (const [id, expr] of Object.entries(rules)) {
    if (typeof expr === 'string' && expr.startsWith('oqs@')) {
      const fn = expr.split(':').slice(1).join(':');
      (funcToRules[fn] ??= []).push(id);
    }
  }

  // Scan oqs-tests.js (+ the V5 overlay lib): attribute each sidecar.* reference to the enclosing
  // function — a rule function (`window.<fn> = function`) or a plain helper (`function <fn>(`).
  // A rule that calls a helper which reads sidecar.* depends on it too: the overlay's header and
  // cache rules only reach sidecar.resources through _oqsV5Res / _oqsV5Main.
  const src = [
    readFileSync(join(OTR, 'data/lib/oqs-tests.js'), 'utf8'),
    readFileSync(join(OVERLAY, OVERLAY_LIB), 'utf8'),
  ]
    .join('\n')
    .split('\n');
  const fnDecl = /window\.([A-Za-z0-9_]+)\s*=\s*function|^\s*function\s+([A-Za-z0-9_]+)\s*\(/;
  const direct = { events: new Set(), resources: new Set() };
  const bodies = {}; // function -> its source lines, to find the helpers it calls
  let cur = null;
  for (const line of src) {
    const m = line.match(fnDecl);
    if (m) cur = m[1] ?? m[2];
    if (!cur) continue;
    (bodies[cur] ??= []).push(line);
    if (line.includes('sidecar.events')) direct.events.add(cur);
    if (line.includes('sidecar.resources')) direct.resources.add(cur);
  }
  // Close over helper calls until nothing changes (helpers can call helpers).
  const reach = (seed) => {
    const out = new Set(seed);
    for (let grew = true; grew;) {
      grew = false;
      for (const [fn, lines] of Object.entries(bodies)) {
        if (out.has(fn)) continue;
        const text = lines.join('\n');
        for (const dep of out) {
          if (new RegExp(`\\b${dep}\\s*\\(`).test(text)) {
            out.add(fn);
            grew = true;
            break;
          }
        }
      }
    }
    return out;
  };
  const buckets = { events: reach(direct.events), resources: reach(direct.resources) };

  // Map flagged functions -> rule ids (drop helpers not bound to any rule).
  const rulesFor = (fns) => {
    const s = new Set();
    for (const fn of fns) for (const id of funcToRules[fn] ?? []) s.add(id);
    return s;
  };
  const eventsRules = rulesFor(buckets.events);
  const resourcesRules = rulesFor(buckets.resources);

  // Walk each V5 ruleset, find which depend (transitively) on a flagged rule.
  const dependents = (depRules) => {
    const out = new Set();
    for (const [rid, def] of Object.entries(rulesets)) {
      const keys = new Set();
      collectKeys(def, keys);
      for (const k of keys) {
        if (ruleIds.has(k) && depRules.has(k)) {
          out.add(rid);
          break;
        }
      }
    }
    return out;
  };
  const eventsRulesets = dependents(eventsRules);
  const resourcesRulesets = dependents(resourcesRules);

  const arr = (s) => JSON.stringify([...s].sort());
  const banner =
    '// AUTO-GENERATED by scripts/sync-assets.mjs — do not edit.\n' +
    '// Catalogue of rules/rulesets that depend on inputs the engine no longer receives directly.\n' +
    '// Each recovery phase (resources, events) reconstructs the matching input; whatever is still\n' +
    '// unrecovered at runtime is forced to "nt".\n\n';
  const body =
    banner +
    `export const eventsRules = new Set<string>(${arr(eventsRules)});\n` +
    `export const eventsRulesets = new Set<string>(${arr(eventsRulesets)});\n\n` +
    `export const resourcesRules = new Set<string>(${arr(resourcesRules)});\n` +
    `export const resourcesRulesets = new Set<string>(${arr(resourcesRulesets)});\n\n` +
    `export const flaggedFunctions = {\n` +
    `  events: ${arr(buckets.events)},\n` +
    `  resources: ${arr(buckets.resources)},\n` +
    `} as const;\n`;

  const outDir = join(ROOT, 'src/engine');
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'rule-deps.generated.ts'), body);
  log(
    `rule-deps: events ${eventsRules.size} rules / ${eventsRulesets.size} rulesets · ` +
      `resources ${resourcesRules.size}/${resourcesRulesets.size}`,
  );
}

// ---------------------------------------------------------------------------
function main() {
  checkPins();
  const overlayMeta = checkOverlayVersion();
  copyEngine();
  copyChecklists();
  copyLocales();
  copyTestDescriptions();
  generateRuleDeps();
  // Last: it fingerprints what copyEngine() actually produced.
  generateEngineVersion(overlayMeta);
  log('done.');
}

main();

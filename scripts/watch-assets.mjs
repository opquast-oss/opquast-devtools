#!/usr/bin/env node
/**
 * Dev-only asset watcher: regenerates the engine/checklist/locale assets whenever a source under
 * data/ changes, so `wxt dev` (which watches public/) hot-reloads the extension for data edits too.
 *
 * Watches: data/engine-overlay, data/checklists, data/test-descriptions (recursive).
 * On change (debounced): runs `sync-assets.mjs` to repopulate public/.
 *
 * Best-effort: a failing regen is logged, never crashes the watcher.
 */
import { spawnSync } from 'node:child_process';
import { watch, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const WATCH_DIRS = ['data/engine-overlay', 'data/checklists', 'data/test-descriptions'];
const DEBOUNCE_MS = 200;

function regen() {
  const started = new Date().toISOString().slice(11, 19);
  // The overlay guard is a release gate, not a dev-loop gate: this watcher re-runs sync-assets on
  // every save, so a hard throw would break editing the overlay at the first keystroke. The real
  // gate is `npm run build`, which calls sync-assets without this variable.
  const res = spawnSync('node', [join('scripts', 'sync-assets.mjs')], {
    env: { ...process.env, ALLOW_OVERLAY_DRIFT: '1' },
    cwd: ROOT,
    stdio: 'inherit',
  });
  if (res.status !== 0) {
    console.error(`[watch-assets] ✗ sync-assets.mjs failed (regen aborted at ${started})`);
    return;
  }
  console.log(`[watch-assets] ✓ assets regenerated (${started})`);
}

let timer = null;
let cooldownUntil = 0; // ignore the duplicate inotify events fired right after a regen
function schedule(file) {
  if (Date.now() < cooldownUntil) return;
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    console.log(`[watch-assets] change detected (${file ?? '?'}) → regenerating…`);
    regen();
    cooldownUntil = Date.now() + 400;
  }, DEBOUNCE_MS);
}

console.log('[watch-assets] watching data/ for changes (sync-assets on edit)…');
for (const rel of WATCH_DIRS) {
  const dir = join(ROOT, rel);
  if (!existsSync(dir)) {
    console.warn(`[watch-assets] skip (missing): ${rel}`);
    continue;
  }
  try {
    watch(dir, { recursive: true }, (_event, filename) => schedule(filename));
  } catch (err) {
    console.warn(`[watch-assets] cannot watch ${rel}: ${err?.message ?? err}`);
  }
}

// Keep the process alive.
process.stdin.resume();

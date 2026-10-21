// The build's guards (scripts/sync-assets.mjs), run for real on a scratch copy of the inputs: an
// overlay edit not recorded in overlay.json, and a missing pins file, must both stop the build.
import { spawnSync } from 'node:child_process';
import {
  appendFileSync,
  cpSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const ROOT = process.cwd();
let dir = '';

/** A scratch project: the script and pins copied, the overlay copied (to edit), the rest linked. */
function scratch(): string {
  dir = mkdtempSync(join(tmpdir(), 'sync-assets-'));
  mkdirSync(join(dir, 'scripts'));
  cpSync(join(ROOT, 'scripts/sync-assets.mjs'), join(dir, 'scripts/sync-assets.mjs'));
  cpSync(join(ROOT, 'scripts/submodule-pins.json'), join(dir, 'scripts/submodule-pins.json'));
  mkdirSync(join(dir, 'data'));
  for (const entry of readdirSync(join(ROOT, 'data'))) {
    if (entry === 'engine-overlay') {
      cpSync(join(ROOT, 'data', entry), join(dir, 'data', entry), { recursive: true });
    } else {
      symlinkSync(join(ROOT, 'data', entry), join(dir, 'data', entry));
    }
  }
  // Linked, the submodule is not the top of a git checkout here: the script takes the pinned
  // commit, as it does for the AMO sources archive.
  symlinkSync(join(ROOT, 'packages'), join(dir, 'packages'));
  return dir;
}

function run(env: Record<string, string> = {}) {
  const { ALLOW_OVERLAY_DRIFT: _a, ALLOW_SUBMODULE_DRIFT: _b, ...base } = process.env;
  return spawnSync('node', [join(dir, 'scripts/sync-assets.mjs')], {
    encoding: 'utf8',
    env: { ...base, ...env },
  });
}

afterEach(() => {
  if (dir) rmSync(dir, { recursive: true, force: true });
  dir = '';
});

describe('sync-assets guards', () => {
  it('builds from untouched inputs, taking the pinned engine commit without a checkout', () => {
    scratch();
    const r = run();
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toContain('no git checkout');
    const stamp = readFileSync(join(dir, 'src/engine/engine-version.generated.ts'), 'utf8');
    const pin = JSON.parse(readFileSync(join(ROOT, 'scripts/submodule-pins.json'), 'utf8'));
    expect(stamp).toContain(pin['opquast-test-runner'].slice(0, 10));
  });

  it('refuses an overlay edit that overlay.json does not record', () => {
    scratch();
    appendFileSync(join(dir, 'data/engine-overlay/oqs-tests-overlay.js'), '\n// edited\n');
    const r = run();
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain('overlay sources changed');
  });

  it('lets it through when drift is allowed, and says so in the engine stamp', () => {
    scratch();
    appendFileSync(join(dir, 'data/engine-overlay/oqs-tests-overlay.js'), '\n// edited\n');
    const r = run({ ALLOW_OVERLAY_DRIFT: '1' });
    expect(r.status, r.stderr).toBe(0);
    const stamp = readFileSync(join(dir, 'src/engine/engine-version.generated.ts'), 'utf8');
    expect(stamp).toMatch(/overlay: "[\d.]+\+dev"/);
  });

  it('stops when the pins file is missing instead of recording a new one', () => {
    scratch();
    rmSync(join(dir, 'scripts/submodule-pins.json'));
    const r = run();
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain('submodule-pins.json');
  });
});

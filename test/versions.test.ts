import { describe, it, expect, vi } from 'vitest';

// Mocked so the suite does not depend on a build artefact: engine-version.generated.ts is written
// by `npm run sync-assets` and gitignored, so a fresh clone would have nothing to import.
vi.mock('@/engine/engine-version.generated', () => ({
  ENGINE_VERSION: {
    engine: '2.0.0-alpha.1',
    submodule: '31a16d9bcb',
    overlay: '0.6.0',
    hash: 'a3f1c8',
    fullHash: 'a3f1c8'.padEnd(64, '0'),
  },
}));

const load = async () => await import('@/lib/versions');

describe('versions', () => {
  it('renders a stamp a human can read in an email', async () => {
    const v = await load();
    const stamp = { ext: '0.6.0', engine: '2.0.0-alpha.1', overlay: '0.6.0', hash: 'a3f1c8' };
    expect(v.formatVersions(stamp, 'fr')).toBe('moteur 2.0.0-alpha.1 · overlay 0.6.0 · a3f1c8');
    expect(v.formatVersions(stamp, 'en')).toBe('engine 2.0.0-alpha.1 · overlay 0.6.0 · a3f1c8');
  });

  it('says so when a record predates traceability', async () => {
    const v = await load();
    expect(v.isUnknown(v.UNKNOWN_VERSIONS)).toBe(true);
    expect(v.isUnknown(undefined)).toBe(true);
    expect(v.formatVersions(v.UNKNOWN_VERSIONS, 'fr')).toMatch(/non tracé/);
  });

  it('does not throw when the manifest is unavailable', async () => {
    // The load-bearing one. @webext-core/fake-browser throws on getManifest, and only
    // about-view.test.ts stubs it — without the catch in currentVersions(), every test that
    // stores an analysis would fail on a call it never made. An empty `ext` loses one field;
    // a throw would lose the analysis.
    const v = await load();
    const stamp = v.currentVersions();
    expect(stamp.ext).toBe('');
    expect(stamp.engine).toBe('2.0.0-alpha.1');
    expect(stamp.hash).toBe('a3f1c8');
    expect(v.isUnknown(stamp)).toBe(false);
  });

  it('compares engines, ignoring the extension version', async () => {
    const v = await load();
    const a = { ext: '0.6.0', engine: '2.0.0', overlay: '0.6.0', hash: 'aaa' };
    expect(v.sameEngine(a, { ...a, ext: '0.7.0' })).toBe(true);
    expect(v.sameEngine(a, { ...a, hash: 'bbb' })).toBe(false);
    expect(v.sameEngine(a, { ...a, overlay: '0.7.0' })).toBe(false);
    expect(v.sameEngine(a, undefined)).toBe(false);
  });
});

/**
 * Which engine produced a verdict.
 *
 * A feedback is only actionable if you know what was running when it was written. Three parts move
 * independently — the vendored engine, the product overlay, and the substituted jQuery — so no
 * single number identifies a build. The stamp carries a readable version for a human reading an
 * email, and a fingerprint that covers what actually ran.
 *
 * The fingerprint comes from scripts/sync-assets.mjs, taken over public/engine/ after every build
 * transformation. See src/engine/engine-version.generated.ts.
 */

import { ENGINE_VERSION } from '@/engine/engine-version.generated';
import { t, type Lang } from './ui-strings';

export interface VersionStamp {
  /** Extension version, from the manifest. */
  ext: string;
  /** Engine package version, e.g. `2.0.0-alpha.1`. */
  engine: string;
  /** Product overlay version, e.g. `0.6.0`. */
  overlay: string;
  /** Short fingerprint of the engine files actually shipped. */
  hash: string;
}

/** A criterion re-run later, under a different engine than the rest of its analysis. */
export interface Revision {
  criterionId: string;
  at: number;
  versions: VersionStamp;
}

/**
 * What a record written before 0.6 carries.
 *
 * Empty strings rather than a guessed value: stamping such a record `0.5.6` would be a lie — it may
 * have been written by 0.5.2. And rather than an absent field, so there is exactly one way of being
 * unknown instead of two (`undefined` and sentinel) for every consumer to handle.
 */
export const UNKNOWN_VERSIONS: VersionStamp = { ext: '', engine: '', overlay: '', hash: '' };

export function isUnknown(v: VersionStamp | undefined): boolean {
  return !v || v.hash === '';
}

/**
 * The stamp of the build running right now.
 *
 * `getManifest()` is wrapped because @webext-core/fake-browser throws on it, and only
 * about-view.test.ts stubs it — without the catch, every test that stores an analysis would fail on
 * a call it never asked for. An empty `ext` degrades one field; a throw would lose the analysis.
 */
export function currentVersions(): VersionStamp {
  let ext = '';
  try {
    ext = browser.runtime.getManifest().version;
  } catch {
    /* no manifest here (tests, or a context without runtime) — the other three still hold */
  }
  return {
    ext,
    engine: ENGINE_VERSION.engine,
    overlay: ENGINE_VERSION.overlay,
    hash: ENGINE_VERSION.hash,
  };
}

/** Same engine, ignoring the extension version — that is what makes two verdicts comparable. */
export function sameEngine(a: VersionStamp | undefined, b: VersionStamp | undefined): boolean {
  if (!a || !b) return false;
  return a.engine === b.engine && a.overlay === b.overlay && a.hash === b.hash;
}

/** `moteur 2.0.0-alpha.1 · overlay 0.6.0 · a3f1c8`, or the "not traced" wording. */
export function formatVersions(v: VersionStamp | undefined, lang: Lang): string {
  if (isUnknown(v)) return t(lang, 'versionUnknown');
  const s = v as VersionStamp;
  return `${t(lang, 'versionEngine')} ${s.engine} · ${t(lang, 'versionOverlay')} ${s.overlay} · ${s.hash}`;
}

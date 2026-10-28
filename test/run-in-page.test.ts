// @vitest-environment happy-dom
// The engine schedules each criterion with setTimeout(fn, 1) and polls for the end with
// setInterval(fn, 5), as loop_over_criteria() in oqs-validator.js does. Firefox throttles those
// timers in a background tab; fake timers stand for timers that never fire on their own.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { runEngineInPage } from '@/engine/run-in-page';

const g = globalThis as any;

/** The engine's loop, reduced to its timers: one task per criterion, then a polling interval. */
function engineLoop(criteria: Record<string, unknown>) {
  const results: string[] = [];
  let pending = Object.keys(criteria);
  for (const id of pending) {
    setTimeout(() => {
      results.push(id);
      pending = pending.filter((p) => p !== id);
    }, 1);
  }
  return new Promise((resolve) => {
    const interval = setInterval(() => {
      if (pending.length === 0) {
        clearInterval(interval);
        resolve(results);
      }
    }, 5);
  });
}

function install(analyze: (criteria: Record<string, unknown>) => unknown) {
  g.jQuery = { extractPageInfo: () => ({}) };
  g.analyze = analyze;
  g.synthesize_results = (r: unknown) => r;
}

const payload = {
  rules: {},
  rulesets: { a: {}, b: {}, c: {} },
  resources: [{ uri: 'https://example.test/' }],
};

afterEach(() => {
  vi.useRealTimers();
  delete g.jQuery;
  delete g.analyze;
  delete g.synthesize_results;
});

describe('runEngineInPage timers', () => {
  it('runs the engine without waiting for throttled timers', async () => {
    vi.useFakeTimers();
    install(engineLoop);
    const out = await runEngineInPage(payload);
    expect(out.results).toEqual(['a', 'b', 'c']);
  });

  it("gives the page's own timers back once the engine is done", async () => {
    vi.useFakeTimers();
    const pageTimeout = setTimeout;
    const pageInterval = setInterval;
    install(engineLoop);
    await runEngineInPage(payload);
    expect(g.setTimeout).toBe(pageTimeout);
    expect(g.setInterval).toBe(pageInterval);
  });

  it('gives them back when the engine throws, too', async () => {
    vi.useFakeTimers();
    const pageTimeout = setTimeout;
    install(() => {
      throw new Error('engine failure');
    });
    await expect(runEngineInPage(payload)).rejects.toThrow('engine failure');
    expect(g.setTimeout).toBe(pageTimeout);
  });

  it('leaves long delays to the browser', async () => {
    vi.useFakeTimers();
    let fired = false;
    install(() => {
      setTimeout(() => (fired = true), 1000);
      return Promise.resolve([]);
    });
    await runEngineInPage(payload);
    expect(fired).toBe(false);
    vi.advanceTimersByTime(1000);
    expect(fired).toBe(true);
  });
});

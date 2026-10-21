import { defineConfig } from 'vitest/config';
import { WxtVitest } from 'wxt/testing';

// WxtVitest wires up the `@/` alias, wxt auto-imports, and a fake `browser` global,
// so unit tests can import extension modules directly.
export default defineConfig({
  plugins: [WxtVitest()],
  test: {
    include: ['test/**/*.test.ts'],
    // The first test of a file pays for importing happy-dom and the WXT shims: on a cold cache or a
    // busy machine that alone can pass the 5 s default.
    testTimeout: 15_000,
  },
});

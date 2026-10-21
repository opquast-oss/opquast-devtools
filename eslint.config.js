// Flat ESLint config. Type-aware linting is intentionally left off for now (fast, clean rollout);
// TypeScript itself (tsc --noEmit, strict + noUnused*) covers type/unused checks.

import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';
import eslintConfigPrettier from 'eslint-config-prettier';

const unusedVars = [
  'error',
  { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
];

export default tseslint.config(
  {
    ignores: [
      'public/**',
      '.output/**',
      '.wxt/**',
      'node_modules/**',
      'packages/**', // vendored submodule (pristine)
      '**/*.generated.*',
      'test/e2e/.build/**', // copies of .output/ made by the e2e harness
      'test/e2e/out/**',
    ],
  },

  // TypeScript sources (extension code + TS tests).
  {
    files: ['src/**/*.ts', 'test/**/*.ts'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      globals: { ...globals.browser, ...globals.node, browser: 'readonly' },
    },
    rules: {
      // The engine bridge legitimately uses `any` at a few serialization boundaries.
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': unusedVars,
    },
  },

  // Build scripts + Node tests (ESM). Browser globals too: some embed page.evaluate() callbacks.
  {
    files: ['scripts/**/*.mjs', 'test/**/*.mjs', 'test/**/*.js'],
    extends: [js.configs.recommended],
    languageOptions: {
      globals: { ...globals.node, ...globals.browser },
    },
    rules: {
      'no-unused-vars': unusedVars,
    },
  },

  // Turn off ESLint rules that would conflict with Prettier (must be last).
  eslintConfigPrettier,
);

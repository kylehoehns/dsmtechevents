// `npm run lint`. Correctness only: no style rules, no formatter. The compact
// style (one-line CSS rules, dense helpers) is on purpose.
import js from '@eslint/js';
import astro from 'eslint-plugin-astro';
import tseslint from 'typescript-eslint';
import globals from 'globals';

const unused = { args: 'after-used', argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none', ignoreRestSiblings: true };

export default [
  { ignores: ['dist/', 'dist-e2e/', '.astro/', 'playwright-report/', 'test-results/', '.claude/'] },
  js.configs.recommended,
  ...tseslint.configs.recommended.map((c) => ({ ...c, files: ['**/*.ts'] })),
  ...astro.configs.recommended,
  {
    rules: {
      // ignoreRestSiblings: `const { drop, ...rest } = x` is how we omit a field.
      'no-unused-vars': ['error', unused],
      'prefer-const': 'error',
      eqeqeq: ['error', 'smart'],
      // `try { localStorage… } catch {}`: storage and beacons are best-effort.
      'no-empty': ['error', { allowEmptyCatch: true }],
    },
  },
  {
    files: ['**/*.ts'],
    rules: {
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': ['error', unused],
      // `cond ? a() : b()` as a statement is house style in the inline scripts.
      '@typescript-eslint/no-unused-expressions': ['error', { allowTernary: true, allowShortCircuit: true }],
      // Browser APIs lib.dom lacks (beforeinstallprompt, navigator.standalone) need `any`.
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
  // Where each file runs decides which globals exist.
  { files: ['src/scripts/**'], languageOptions: { globals: globals.browser } },
  { files: ['public/sw.js'], languageOptions: { globals: globals.serviceworker } },
  { files: ['worker/**'], languageOptions: { globals: globals.worker } },
  // Imported by both the build and the browser (app.js, the TV page).
  { files: ['src/lib/**'], languageOptions: { globals: globals['shared-node-browser'] } },
  { files: ['src/lib/data.mjs'], languageOptions: { globals: globals.node } }, // build only: reads data/
  // Frontmatter runs at build time in Node; <script> blocks run in the browser.
  { files: ['**/*.astro', '**/*.astro/*.js', '**/*.astro/*.ts'], languageOptions: { globals: { ...globals.node, ...globals.browser } } },
  { files: ['scripts/**', 'tests/**', '*.mjs'], languageOptions: { globals: globals.node } },
  // Playwright's page.evaluate() callbacks run in the browser.
  { files: ['tests/e2e/**'], languageOptions: { globals: { ...globals.node, ...globals.browser } } },
];

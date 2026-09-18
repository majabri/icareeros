/**
 * ESLint flat config.
 *
 * Until now this repo had no linting at all: package.json carried a `lint`
 * script pointing at `next lint`, but that command was REMOVED in Next 16 and
 * this repo is on 16.3.3, so `npm run lint` misparsed its argument as a
 * directory and failed for everyone who tried it. There was also no eslint
 * dependency and no config file — the script had been dead for a while and the
 * absence was invisible because nothing in CI runs it.
 *
 * `eslint-config-next` 16.x ships flat-config arrays directly from its
 * subpath exports, so no FlatCompat shim is needed.
 *
 * Scope note: this establishes linting, it does not retrofit a clean tree.
 * Nothing in .github/workflows runs `npm run lint`, and wiring it into CI as a
 * required check on a codebase that has never been linted would light up a
 * wall of pre-existing findings that have nothing to do with whoever pushes
 * next. Getting to zero, then gating CI, is its own piece of work.
 */

import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypeScript from "eslint-config-next/typescript";

export default [
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "out/**",
      "build/**",
      "coverage/**",
      // Playwright writes these; they are generated artifacts, not source.
      "playwright-report/**",
      "test-results/**",
      // Deno edge functions — different runtime and module resolution, and
      // tsconfig.json already excludes them from typecheck for the same reason.
      "supabase/**",
      "next-env.d.ts",
    ],
  },
  ...nextCoreWebVitals,
  ...nextTypeScript,
];

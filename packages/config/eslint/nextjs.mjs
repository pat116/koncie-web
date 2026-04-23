// Next.js ESLint config — extends the base with React + @next/next rules.
// Consumed by apps/web/eslint.config.mjs.
//
// Note: @next/eslint-plugin-next 14.x ships a `no-duplicate-head` rule that
// crashes on ESLint 9's new context API (context.getAncestors is gone). We
// disable that rule until the plugin is upgraded for ESLint 9.
import baseConfig from './index.mjs';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import nextPlugin from '@next/eslint-plugin-next';

/** @type {import('eslint').Linter.Config[]} */
export default [
  ...baseConfig,
  {
    files: ['**/*.{ts,tsx,js,jsx}'],
    plugins: {
      react,
      'react-hooks': reactHooks,
      '@next/next': nextPlugin,
    },
    rules: {
      ...react.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs['core-web-vitals'].rules,
      'react/react-in-jsx-scope': 'off',
      'react/prop-types': 'off',
      // Broken on ESLint 9 — re-enable after @next/eslint-plugin-next upgrade.
      '@next/next/no-duplicate-head': 'off',
    },
    settings: {
      react: { version: 'detect' },
    },
  },
];

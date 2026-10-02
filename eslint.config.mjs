import { FlatCompat } from '@eslint/eslintrc';

/**
 * Flat ESLint config (ESLint 9) built on `eslint-config-next` through the
 * compatibility layer, so the Next.js rules work exactly as documented.
 */
const compat = new FlatCompat({ baseDirectory: import.meta.dirname });

const config = [
  ...compat.extends('next/core-web-vitals', 'next/typescript'),
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'warn',
      'no-console': ['warn', { allow: ['warn', 'error', 'info'] }],
    },
  },
  {
    ignores: ['.next/**', 'node_modules/**', 'tests/**', 'supabase/**'],
  },
];

export default config;

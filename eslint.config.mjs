import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';

const eslintConfig = [
  {
    ignores: [
      '.next/**',
      '.claude/**',
      'node_modules/**',
      '.open-next/**',
      '.wrangler/**',
      'cloudflare-env.d.ts',
      'src/generated/**',
      'redesign/**',
      'coverage/**',
      'dist/**',
    ],
  },
  ...nextVitals,
  ...nextTs,
  {
    files: ['next.config.js', 'postcss.config.js'],
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
  {
    rules: {
      // React Compiler lint rule introduced with eslint-config-next 16. The
      // codebase has several fetch-then-setState effects that predate it;
      // surface them as warnings until they are migrated.
      'react-hooks/set-state-in-effect': 'warn',
    },
  },
];

export default eslintConfig;

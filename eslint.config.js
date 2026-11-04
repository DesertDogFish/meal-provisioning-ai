import js from '@eslint/js';
import tsParser from '@typescript-eslint/parser';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import importPlugin from 'eslint-plugin-import';

export default [
  {
    ignores: [
      'dist',
      'provisions',
      'playwright-report',
      'coverage',
      'node_modules',
      '.eslintrc.cjs',
    ],
  },
  js.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      parser: tsParser,
      ecmaVersion: 2020,
      sourceType: 'module',
      globals: {
        window: 'readonly',
        document: 'readonly',
        navigator: 'readonly',
        console: 'readonly',
        process: 'readonly',
        URL: 'readonly',
        fetch: 'readonly',
        React: 'readonly',
      },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
      'jsx-a11y': jsxA11y,
      import: importPlugin,
    },
    rules: {
      ...tsPlugin.configs.recommended.rules,
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-explicit-any': 'warn',
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      '@typescript-eslint/ban-ts-comment': ['error', { 'ts-ignore': true, 'ts-expect-error': true }],
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      'react-refresh/only-export-components': 'off',
      'jsx-a11y/alt-text': 'warn',
      'import/order': [
        'warn',
        { groups: ['builtin', 'external', 'internal', 'parent', 'sibling', 'index'], 'newlines-between': 'always' },
      ],
      'import/no-cycle': 'warn',
    },
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['src/api/**', 'src/data/mockData.ts', 'src/components/ToastProvider.tsx', 'src/components/ErrorBoundary.tsx'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['**/AppContext'], message: 'Запрещено вне src/api/' },
            { group: ['**/mockData'], message: 'Запрещено вне src/api/' },
            { group: ['**/mockSeed'], message: 'Запрещено вне src/api/' },
          ],
        },
      ],
    },
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['src/pages/TripPrintPage.tsx'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: "Literal[value=/^#[0-9a-fA-F]{3,8}$/]",
          message: 'Hex-литералы запрещены в компонентах — используйте design tokens (var(--…)).',
        },
      ],
    },
  },
];

module.exports = {
  root: true,
  env: { browser: true, es2020: true, node: true },
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:react-hooks/recommended',
  ],
  ignorePatterns: ['dist', '.eslintrc.cjs', 'provisions', 'playwright-report', 'coverage'],
  parser: '@typescript-eslint/parser',
  plugins: ['react-refresh'],
  overrides: [
    {
      files: ['src/**/*.{ts,tsx}'],
      excludedFiles: [
        'src/api/**/*',
        // Временно — для файлов, которые ещё используют mockData:
        'src/data/mockData.ts',
        'src/components/ToastProvider.tsx',
        'src/components/ErrorBoundary.tsx',
        'src/pages/ErrorsDemoPage.tsx',
        'src/pages/SyncLogsPage.tsx',
      ],
      rules: {
        'no-restricted-imports': ['error', {
          patterns: [
            { group: ['**/AppContext'], message: 'Запрещено вне src/api/' },
            { group: ['**/mockData'], message: 'Запрещено вне src/api/' },
            { group: ['**/mockSeed'], message: 'Запрещено вне src/api/' }
          ]
        }],
        'react-refresh/only-export-components': 'off'
      }
    }
  ],
  rules: {
    'no-unused-vars': 'off',
    '@typescript-eslint/no-unused-vars': ['error', {
      argsIgnorePattern: '^_',
      varsIgnorePattern: '^_',
      caughtErrorsIgnorePattern: '^_'
    }],
    '@typescript-eslint/no-explicit-any': 'off',
    'no-console': 'off'
  }
};

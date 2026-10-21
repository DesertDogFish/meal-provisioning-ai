module.exports = {
  root: true,
  env: { browser: true, es2020: true, node: true },
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:react-hooks/recommended',
  ],
  ignorePatterns: ['dist', '.eslintrc.cjs'],
  parser: '@typescript-eslint/parser',
  plugins: ['react-refresh'],
  overrides: [
    {
      files: ['src/**/*.{ts,tsx}'],
      excludedFiles: [
        'src/api/**/*',
        // Временно — до завершения миграции Батча 3:
        'src/App.tsx',
        'src/store/AppContext.tsx',
        'src/data/mockData.ts',
        'src/components/PriceOverridesTab.tsx',
        'src/components/SubstitutionModal.tsx',
        'src/components/ToastProvider.tsx',
        'src/components/ErrorBoundary.tsx',
        'src/pages/ErrorsDemoPage.tsx',
        'src/pages/RecipesPage.tsx',
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

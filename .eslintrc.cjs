module.exports = {
  root: true,
  env: {
    browser: true,
    es2020: true,
    node: true
  },
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:react-hooks/recommended'
  ],
  ignorePatterns: [
    'dist',
    '.eslintrc.cjs',
    'node_modules',
    'backend'
  ],
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module'
  },
  plugins: [
    'react-refresh',
    '@typescript-eslint'
  ],
  rules: {
    'react-refresh/only-export-components': [
      'warn',
      {
        allowConstantExport: true
      }
    ],
    '@typescript-eslint/no-unused-vars': [
      'error',
      {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_'
      }
    ],
    '@typescript-eslint/no-explicit-any': 'warn',
    'no-console': [
      'warn',
      {
        allow: [
          'warn',
          'error'
        ]
      }
    ],
    'no-restricted-imports': [
      'error',
      {
        patterns: [
          {
            group: [
              '**/AppContext',
              '**/mockData',
              '**/mockSeed'
            ],
            message: 'Прямой импорт AppContext/mockData/mockSeed запрещён вне src/api/. Используйте API клиент из src/api/client.ts'
          }
        ],
        paths: [
          {
            name: '../store/AppContext',
            message: 'AppContext удалён. Используйте API клиент из src/api/client.ts'
          },
          {
            name: '../data/mockData',
            message: 'mockData перемещён в src/api/mockSeed.ts. Используйте API клиент.'
          }
        ]
      }
    ]
  },
  overrides: [
    {
      files: [
        'src/api/**/*'
      ],
      rules: {
        'no-restricted-imports': 'off'
      }
    },
    {
      files: [
        'src/**/*.{ts,tsx}'
      ],
      excludedFiles: [
        'src/api/**/*',
        'src/App.tsx',
        'src/store/AppContext.tsx',
        'src/pages/ProductsPage.tsx',
        'src/pages/RecipesPage.tsx',
        'src/pages/SyncLogsPage.tsx',
        'src/pages/TripDetailPage.tsx',
        'src/pages/TripsPage.tsx'
      ],
      rules: {
        'no-restricted-imports': ['error', {
          patterns: [
            { group: ['**/AppContext'], message: 'Запрещено вне src/api/' },
            { group: ['**/mockData'], message: 'Запрещено вне src/api/' },
            { group: ['**/mockSeed'], message: 'Запрещено вне src/api/' }
          ]
        }]
      }
    }
  ]
};

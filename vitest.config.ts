import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'happy-dom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.{test,spec}.{js,mjs,cjs,ts,jsx,tsx}'],
    exclude: [
      'node_modules/**',
      'dist/**',
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'src/test/',
      ],
      // Гейт R5 (PLAN.md, Фаза 10 п.5): точечные пороги lines ≥80% на зоне
      // изменения — src/utils/**, src/api/** и новые компоненты.
      // perFile: true — порог проверяется по КАЖДОМУ файлу, поэтому legacy
      // (страницы, модалки без тестов) не может «скрыть» провал новой кода,
      // а новый код не может спрятаться за общим процентом папки.
      // Порог применяется только к файлам из `include`: файлы вне зоны
      // изменения в гейт не входят (R5: «не гнаться за 100% legacy»).
      thresholds: {
        lines: 80,
        perFile: true,
      },
      include: [
        // src/api: зона изменения MODE-сьюта (mockServer.ts — legacy-мок 564 строк,
        // вне гейта по правилу R5 «не гнаться за legacy»; его контракт-тесты MOCK-01..03)
        'src/api/client.ts',
        'src/api/mode.ts',
        'src/api/watchdog.ts',
        
        // src/utils: математика/расчёты (errorHandler/errors/validation — legacy, вне гейта)
        'src/utils/calc.ts',
        'src/utils/calculations.ts',
        // новые компоненты, выделенные в Фазе 10
        'src/components/ProductTable.tsx',
        'src/components/TripForm.tsx',
        'src/components/ApiModeBadge.tsx',
        'src/components/DateRange.tsx',
        'src/components/NumberField.tsx',
        // админ-редактор блюд (экран «Каталог блюд»)
        'src/components/RecipeEditorModal.tsx',
      ],
    },
  },
});

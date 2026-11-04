import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()] as any,
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
        // src/api: зона изменения MODE-сьюта (mockServer.ts и модули mock*, выделенные
        // в подзадаче 25 аудита, — legacy-мок, вне гейта по правилу R5 «не гнаться за
        // legacy»; его контракт-тесты MOCK-01..03 и mock-parity-сьюты)
        'src/api/client.ts',
        // подзадача 24 (аудит 29.10.2026): модули, выделенные из client.ts
        'src/api/authInterceptor.ts',
        'src/api/modeResolver.ts',
        'src/api/problemDetailParser.ts',
        'src/api/mode.ts',
        'src/api/watchdog.ts',
        
        // src/utils: математика/расчёты (errorHandler/errors/validation — legacy, вне гейта)
        'src/utils/calc.ts',
        'src/utils/calculations.ts',
        // Release-1.0 (UI-consistency): единый формат чисел/единиц — зона изменения
        'src/utils/format.ts',
        // новые компоненты, выделенные в Фазе 10
        'src/components/ProductTable.tsx',
        // BL-16: extracted product create/edit modal
        'src/components/ProductFormModal.tsx',
        // bugs-products-catalog п.4: мультиселект фильтра категорий
        'src/components/CustomMultiSelect.tsx',
        // BL-63 (аудит 02.11.2026, подзадача 7): алерты на токенах — зона изменения
        'src/components/ProblemDetailAlert.tsx',
        'src/components/TripForm.tsx',
        'src/components/ApiModeBadge.tsx',
        'src/components/DateRange.tsx',
        'src/components/NumberField.tsx',
        // админ-редактор блюд (экран «Каталог блюд»)
        'src/components/RecipeEditorModal.tsx',
        // Патч «UX-список 26.10» (R5): новые утилиты и компоненты
        'src/utils/rowSort.ts',
        'src/utils/menuOverlay.ts',
        'src/utils/manualItems.ts',
        'src/utils/checklist.ts',
        'src/components/AmountInput.tsx',
        'src/components/ManualItemsModal.tsx',
        // bugs-trip-menu-stage п.4: общий блок «поиск + кол-во + добавить»
        'src/components/ProductAddRow.tsx',
        // Fix-3 (список 26.10, итерация 3): готовность похода, ввод чека суммой, CSV-экспорт
        'src/utils/readiness.ts',
        'src/utils/checkInput.ts',
        'src/utils/checkExport.ts',
        // Fix-5: тултипы-формулы, единая шапка вкладок, серверные исключения (R2-2)
        'src/components/InfoTip.tsx',
        'src/components/TabHeader.tsx',
        'src/api/shoppingExclusions.ts',
        // Fix-6 (список 26.10, итерация 6): правки состава в расчётах, свободные
        // единицы факта, подтверждения удалений
        'src/utils/recipeEdits.ts',
        'src/utils/checkUnits.ts',
        'src/components/FreeAmountInput.tsx',
        'src/components/ConfirmDialog.tsx',
        // Fix-7 (список 26.10, итерация 7): портал-позиция дропдаунов, кнопка «наверх»
        'src/utils/dropdownPos.ts',
        'src/components/ScrollTopButton.tsx',
        // plans/done/2026-10-29-ui-nowrap-and-mobile.md (R5): чеклист-компонент,
        // поповер подсказки и единый оверлей модалок
        'src/components/ChecklistTab.tsx',
        // plan plans/2026-10-30-mobile-workflow-ux.md (R5): новые компоненты
        // мобильного воркфлоу «4 этапа»
        'src/components/StageTabBar.tsx',
        'src/components/BottomSheet.tsx',
        'src/components/KebabMenu.tsx',
        'src/components/UnitChip.tsx',
        'src/components/FilterSheet.tsx',
        // подзадача 26 (аудит 29.10.2026): TripDetailPage декомпозирована —
        // презентационные компоненты вкладок/шапки + чистые производные
        'src/utils/tripDerived.ts',
        'src/components/TripActions.tsx',
        'src/components/TripSummaryPanel.tsx',
        'src/components/TripMealCard.tsx',
        'src/components/TripDaysList.tsx',
        'src/components/TripShoppingTab.tsx',
        'src/components/TripDayShoppingTab.tsx',
        'src/components/ExclusionCheckbox.tsx',
        'src/components/Modal.tsx',
        // plan plans/2026-10-31-ux-audit-cleanup-dedup.md (R5): новые компоненты
        // интеграций (п.2/п.3), AuthProvider (п.7), модель/компоненты этапа ④ (п.5),
        // единый загрузчик и модель печати (п.6), прогресс списка (п.8)
        'src/components/EmisSettingsTab.tsx',
        'src/components/SyncLogsTab.tsx',
        'src/components/CatalogImportTab.tsx',
        'src/components/AuthProvider.tsx',
        'src/components/ChecksModel.ts',
        'src/components/ChecksTable.tsx',
        'src/components/ChecksMobile.tsx',
        'src/components/WhoOwesBlock.tsx',
        'src/utils/tripLoader.ts',
        'src/utils/printModel.ts',
        'src/api/mockTripProgress.ts',
        // plan plans/2026-10-31-ux-audit-navigation.md (R5): CTA «Далее» (п.2)
        // и единое пустое состояние этапов (п.3)
        'src/components/StageNextCta.tsx',
        'src/components/EmptyState.tsx',
        // navigation-п.5: sheet просмотра блюда из меню + резолв снепшота в каталог
        'src/components/RecipeViewSheet.tsx',
        'src/utils/recipeRef.ts',
        // plan plans/done/2026-10-31-ux-audit-visual-inspection.md (R5): плюрализация
        // подписей (п.1), единый маппинг field→RU-копи ошибок (п.2), контракт
        // поля даты (п.3, KB-32)
        'src/utils/text.ts',
        'src/utils/validationMessages.ts',
        'src/components/DatePicker.tsx',
        'src/utils/dateInput.ts',
        // того же плана п.13/п.14: иерархия оверлеев (Esc закрывает верхний) и
        // фокус-ловушка модалок/шитов (Tab-цикл, возврат фокуса, preventScroll)
        'src/utils/overlayStack.ts',
        'src/utils/focusTrap.ts',
        // BL-66 (аудит 02.11.2026): явный 404-маршрут — новая страница в зоне изменения
        'src/pages/NotFoundPage.tsx',
        // BL-41 (AU-13): сигнал 409 CONCURRENT_MODIFICATION и диалог «данные изменились»
        'src/api/conflictSignal.ts',
        'src/components/ConflictDialog.tsx',
        // BL-27 (V37): серверный факт количества чеклиста — новый api-модуль
        'src/api/checklistActual.ts',
      ],
    },
  },
});

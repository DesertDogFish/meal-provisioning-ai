// @ts-nocheck
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Info, Undo2, X } from 'lucide-react'; // Plus удалён: неиспользуемый импорт (lint-error на HEAD)

import type { ProblemDetail } from '../types/errors';
import {
  api, getMealComposition, putMealComposition, humanize, packHint, humanizeWeight,
} from '../api/client';
import { formatRub, categoryName } from '../utils/format'; // Release-1.0: единый формат чисел
import type { CompositionItem, CompositionPutRequest, CompositionResponse } from '../api/client';
import type { Ingredient, MealType, UnitOfMeasure } from '../types';
import { loadActualPrices, loadBought, loadActualQty, refreshBoughtFromServer, BOUGHT_SYNC_SOFT_TIMEOUT_MS } from '../utils/tripStaging'; // transparency-п.3 + KB-15
import { pluralize } from '../utils/pluralize';

import Modal from './Modal';
import { Button } from './Button';
import RecipeSearchSelect from './RecipeSearchSelect';
import ProductAddRow from './ProductAddRow';
import CustomSelect from './CustomSelect'; // Fix-6 (п.1)
import { useConfirm } from './ConfirmDialog'; // Fix-6 (п.7)
import { ProblemDetailAlert } from './ProblemDetailAlert';
import { useToast } from './ToastProvider';
import { parseAmount } from './AddMealModal';
import AmountInput from './AmountInput';
import { useMealCompositionModal, MEAL_TYPE_LABELS, fmtQty, type DraftState } from './useMealCompositionModal';

export default function MealCompositionModalView({ vm }: { vm: any }) {
  const {
    addAmount,
    addAsk,
    addAskCategory,
    addProduct,
    addQuery,
    addSelected,
    affectedResetNames,
    applyFreeTextAdd,
    badgeOf,
    buildPutBody,
    cancelSubst,
    categories,
    commitAdd,
    commitSubst,
    drafts,
    effOf,
    extraRows,
    hasExtras,
    isDirty,
    liveTotals,
    loadError,
    loading,
    mergeAsk,
    offerFreeTextAdd,
    onQuantityChange,
    openSubst,
    products,
    reload,
    removeExtra,
    requestClose,
    resetDrafts,
    resetRow,
    resolveFreeRows,
    rows,
    save,
    saveProblem,
    saving,
    server,
    setAddAmount,
    setAddAsk,
    setAddAskCategory,
    setAddQuery,
    setAddSelected,
    setCategories,
    setDraft,
    setDrafts,
    setExtraRows,
    setLoadError,
    setLoading,
    setMergeAsk,
    setProducts,
    setSaveProblem,
    setSaving,
    setServer,
    setSubstOpenFor,
    setSubstRatio,
    setSubstTarget,
    setSubstitutes,
    substOpenFor,
    substRatio,
    substTarget,
    substitutes,
    toggleExclude,
    confirm,
    confirmDialog,
    isAdmin,
    onEditCatalogRecipe,
  } = vm;
  return (
    <Modal onClose={() => void requestClose()}>
      <div
        className="modal-sheet rounded-2xl shadow-xl w-full max-w-3xl p-6 my-8"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
        role="dialog"
        aria-label="Состав приёма"
      >
        {/* Шапка с контекстом дня/типа (§2.2) */}
        <div className="modal-head flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold flex items-center gap-2" style={{ color: 'var(--text)' }}>
              Состав приёма
              {isDirty && <span title="Изменения не сохранены" data-testid="dirty-dot" style={{ color: 'var(--fire, #d97706)' }}>●</span>}
            </h2>
            {server && (
              <p className="text-sm mt-0.5" style={{ color: 'var(--muted)' }}>
                День{server.dayDate ? ` · ${new Date(`${server.dayDate}T00:00:00`).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })}` : ''}
                {' · '}{MEAL_TYPE_LABELS[server.mealType]} · {server.recipeName} · {server.people} человека
              </p>
            )}
          </div>
          {/* U21: крестик — иконка приложения, а не текстовый глиф «✕» */}
          <Button variant="ghost" size="sm" onClick={() => void requestClose()} aria-label="Закрыть"><X size={18} /></Button>
        </div>

        <p className="text-xs mt-2 mb-3 flex items-start gap-1.5" style={{ color: 'var(--muted)' }}>
          <Info size={14} style={{ flexShrink: 0, marginTop: 1 }} />
          Правки применяются только к этому приёму — блюдо в справочнике не изменяется.
          {isAdmin && onEditCatalogRecipe && server && (
            <button
              type="button"
              className="underline ml-1"
              onClick={() => onEditCatalogRecipe(server.catalogRecipeId ?? server.recipeId)}
            >
              Изменить блюдо в справочнике
            </button>
          )}
        </p>

        {hasExtras && (
          <p className="text-xs mb-3 px-2 py-1.5 rounded" data-testid="extras-banner"
             style={{ background: 'color-mix(in srgb, var(--wave-400) 10%, transparent)', color: 'var(--muted)' }}>
            Добавленные позиции — фиксированное количество на приём, при смене людей не меняются.
            Люди редактируются на карточке приёма, не здесь.
          </p>
        )}

        {loading && <p className="py-6 text-center" style={{ color: 'var(--muted)' }}>Загрузка состава…</p>}
        {loadError && !loading && (
          <div className="mb-3">
            <p style={{ color: 'var(--danger)' }}>{loadError}</p>
            <Button variant="ghost" size="sm" onClick={() => void reload()}>Повторить</Button>
          </div>
        )}

        {!loading && server && (
          <>
            <table className="w-full text-sm meal-comp" aria-label="Состав приёма">
              <thead>
                <tr style={{ color: 'var(--muted)' }}>
                  <th className="text-left font-medium py-1">Продукт</th>
                  <th className="text-left font-medium py-1">Кол-во на приём</th>
                  <th className="text-left font-medium py-1">Статус</th>
                  <th className="text-right font-medium py-1">Действия</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const ingId = String(row.ingredientId);
                  const d = row.draft;
                  const state: DraftState = d?.state ?? row.state;
                  const excluded = state === 'EXCLUDED';
                  const eff = effOf(row);
                  const badge = badgeOf(row);
                  const subActive = substitutes.find((s) => s.fromIngredientId === ingId);
                  const fromReplaced = (server.substitutions ?? []).some((s) => String(s.fromIngredientId) === ingId) || !!subActive;
                  const hint = packHint(row);
                  return (
                    <tr key={ingId} data-row={ingId} style={{ borderTop: '1px solid var(--border)', opacity: excluded || fromReplaced ? 0.55 : 1 }}>
                      <td className="py-2 pr-2 align-top">
                        <span style={{ color: 'var(--text)', textDecoration: excluded ? 'line-through' : undefined }}>{row.name}</span>
                      </td>
                      <td className="py-2 pr-2 align-top" style={{ minWidth: 120 }}>
                        {excluded ? (
                          <span style={{ color: 'var(--muted)' }}>———</span>
                        ) : (
                          <>
                            {/* U31: ввод в г/мл с переключателем — без «0,015 кг» */}
                            <AmountInput
                              size="sm"
                              value={eff}
                              unit={row.unit}
                              disabled={fromReplaced}
                              onChange={(n) => onQuantityChange(row, String(n))}
                              ariaLabel={`Количество: ${row.name}`}
                              testId={`qty-${ingId}`}
                            />
                            {hint && <div className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>{hint}</div>}
                          </>
                        )}
                      </td>
                      <td className="py-2 pr-2 align-top">
                        <span className="text-xs px-2 py-0.5 rounded-full" style={{ color: badge.tone, background: 'var(--elev)', border: '1px solid var(--border)' }}>
                          {subActive ? `замена → ${products.find((p) => String(p.id) === subActive.toIngredientId)?.name ?? '?'}` : badge.text}
                        </span>
                      </td>
                      <td className="py-2 align-top text-right whitespace-nowrap">
                        {(state === 'RECIPE' || state === 'SCALED') && !fromReplaced && (
                          <>
                            <Button variant="ghost" size="sm" onClick={() => openSubst(row)} aria-label={`Заменить: ${row.name}`}>Заменить</Button>
                            <Button variant="ghost" size="sm" onClick={() => toggleExclude(row)} aria-label={`Исключить: ${row.name}`}>Исключить</Button>
                          </>
                        )}
                        {state === 'SCALED' && (
                          <Button variant="ghost" size="sm" onClick={() => resetRow(row)} aria-label={`Сбросить: ${row.name}`}>
                            <Undo2 size={13} /> Сбр.
                          </Button>
                        )}
                        {state === 'EXCLUDED' && (
                          <Button variant="ghost" size="sm" onClick={() => toggleExclude(row)} aria-label={`Вернуть: ${row.name}`}>Вернуть</Button>
                        )}
                        {state === 'EXTRA' && (
                          <Button variant="ghost" size="sm" onClick={() => removeExtra(row)} aria-label={`Удалить: ${row.name}`}>Удалить</Button>
                        )}
                        {(fromReplaced || subActive) && (
                          <Button variant="ghost" size="sm" onClick={() => cancelSubst(ingId)} aria-label={`Отменить замену: ${row.name}`}>Отменить замену</Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {/* Инлайн-раскрытие замены (§2.2) */}
            {substOpenFor && (() => {
              const row = rows.find((r) => String(r.ingredientId) === substOpenFor);
              if (!row) return null;
              const target = products.find((p) => String(p.id) === substTarget);
              const unitMismatch = target && target.unit !== row.unit;
              return (
                <div className="mt-2 rounded-lg p-3 flex flex-wrap items-end gap-3" data-testid="subst-editor"
                     style={{ background: 'var(--elev)', border: '1px solid var(--border)' }}>
                  <div className="flex-1" style={{ minWidth: 220 }}>
                    <label className="block text-xs mb-1" style={{ color: 'var(--muted)' }}>
                      Заменить «{row.name}» на…
                    </label>
                    <RecipeSearchSelect
                      value={substTarget}
                      onChange={setSubstTarget}
                      options={products
                        .filter((p) => String(p.id) !== substOpenFor)
                        .map((p) => ({ value: String(p.id), label: p.name, hint: p.category }))}
                      placeholder="Найти продукт-цель…"
                      emptyText="Не найдено"
                      ariaLabel="Продукт-цель замены"
                    />
                    {unitMismatch && (
                      <p className="text-xs mt-1" style={{ color: 'var(--fire, #d97706)' }}>
                        единицы различаются: {row.unit} → {target!.unit} — коэффициент обязателен
                      </p>
                    )}
                  </div>
                  <div>
                    <label className="block text-xs mb-1" style={{ color: 'var(--muted)' }}>Коэфф.</label>
                    <input
                      type="text" inputMode="decimal" aria-label="Коэффициент замены"
                      value={substRatio}
                      onChange={(e) => setSubstRatio(e.target.value)}
                      className="w-20 px-2 py-1.5 rounded"
                      style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }}
                    />
                  </div>
                  <Button variant="primary" size="sm" onClick={() => commitSubst(row)}>Применить замену</Button>
                  <Button variant="ghost" size="sm" onClick={() => setSubstOpenFor(null)}>Отмена</Button>
                </div>
              );
            })()}

            {/* Строка добавления продукта. bugs-trip-menu-stage п.4: «составной
                искатель» (заголовок панели + сетка лейблов «Найти продукт в
                справочнике»/«Кол-во») заменён на общий простой блок ProductAddRow —
                одна строка «поиск + кол-во + добавить», как в создании блюда
                (RecipeIngredientsEditor); подтверждения (новый продукт / merge)
                остаются под строкой в той же панели. */}
            <div className="mt-4 p-3 rounded-lg" style={{ background: 'var(--elev)', border: '1px solid var(--border)' }}>
              <ProductAddRow
                options={products.map((p) => ({ value: String(p.id), label: p.name, hint: `${p.category} · ${humanize(1, p.unit)}` }))}
                value={addSelected}
                onValueChange={(v) => { setAddSelected(v); setMergeAsk(null); }}
                onQueryChange={setAddQuery}
                amount={addAmount}
                onAmountChange={(v) => { setAddAmount(v); setMergeAsk(null); }}
                unit={products.find((p) => String(p.id) === addSelected)?.unit ?? 'PCS'}
                searchAriaLabel="Поиск продукта"
                searchPlaceholder="Название продукта…"
                searchEmptyText="Не найдено"
                amountAriaLabel="Количество добавляемого продукта"
                amountTestId="add-amount"
                onAdd={() => { if (addSelected) addProduct(false); else offerFreeTextAdd(); }}
                addAriaLabel="Добавить продукт в состав"
              >

            {/* Инлайн-предложение добавить набранное название как новый продукт (§2.2) */}
            {addAsk && (
              <div className="mt-2 rounded-lg p-3 text-sm flex flex-wrap items-center gap-3" data-testid="add-new-confirm"
                   style={{ background: 'color-mix(in srgb, var(--w1, #0ea5e9) 10%, transparent)', color: 'var(--text)' }}>
                в составе нет продукта «{addAsk.name}» — добавить его позицией {fmtQty(addAsk.amount, addAsk.unit)}?
                {isAdmin ? (
                  <label className="flex items-center gap-1.5" style={{ color: 'var(--muted)' }}>
                    Категория:
                    {/* Fix-6 (п.1): нативный select — чужеродно; единый CustomSelect */}
                    <span style={{ minWidth: 160 }}>
                      <CustomSelect
                        value={addAskCategory || categories[0]?.id || ''}
                        onChange={(v) => setAddAskCategory(v)}
                        options={categories.map((c) => ({ value: c.id, label: c.name }))}
                        ariaLabel="Категория нового продукта"
                      />
                    </span>
                  </label>
                ) : (
                  <span style={{ color: 'var(--muted)' }}>
                    (новый продукт сможет завести только администратор — при сохранении)
                  </span>
                )}
                <Button variant="primary" size="sm" onClick={applyFreeTextAdd}>Да, добавить</Button>
                <Button variant="ghost" size="sm" onClick={() => setAddAsk(null)}>Отмена</Button>
              </div>
            )}

            {/* Инлайн-подтверждение merge для уже присутствующего продукта */}
            {mergeAsk && (
              <div className="mt-2 rounded-lg p-3 text-sm flex flex-wrap items-center gap-3" data-testid="merge-confirm"
                   style={{ background: 'color-mix(in srgb, var(--fire, #d97706) 10%, transparent)', color: 'var(--text)' }}>
                {mergeAsk.current > 0
                  ? <>уже в составе ({fmtQty(mergeAsk.current, mergeAsk.unit)}) — установить {fmtQty(mergeAsk.wanted, mergeAsk.unit)}?</>
                  : <>продукт исключён — вернуть и установить количество {fmtQty(mergeAsk.wanted, mergeAsk.unit)}?</>}
                <Button variant="primary" size="sm" onClick={() => addProduct(true)}>Да, применить</Button>
                <Button variant="ghost" size="sm" onClick={() => setMergeAsk(null)}>Отмена</Button>
              </div>
            )}
              </ProductAddRow>
            </div>

            {/* Итоги live (§2.2) */}
            {liveTotals && (
              <p className="mt-4 text-sm" data-testid="composition-totals" style={{ color: 'var(--muted)' }}>
                Итого на приём: {liveTotals.kcal} ккал · {humanizeWeight(liveTotals.weightGrams)}
                {' · '}план {formatRub(server.totals.plannedCost)}
              </p>
            )}

            {saveProblem && (
              <div className="mt-3">
                <ProblemDetailAlert problemDetail={saveProblem} onClose={() => setSaveProblem(null)} />
              </div>
            )}

            {/* Одна commit-кнопка + сброс (§2.2) */}
            <div className="modal-foot flex items-center justify-end gap-3 mt-4">
              <span className="text-sm mr-auto" style={{ color: isDirty ? 'var(--fire, #d97706)' : 'var(--muted)' }}>
                {isDirty ? 'Изменения не сохранены ●' : 'Всё сохранено'}
              </span>
              <Button variant="ghost" onClick={resetDrafts} disabled={!isDirty} aria-label="Сбросить изменения">Сбросить</Button>
              <Button variant="primary" onClick={() => void save()} disabled={!isDirty || saving} aria-label="Сохранить состав">
                {saving ? 'Сохраняем…' : 'Сохранить'}
              </Button>
            </div>
          </>
        )}
        {/* Fix-6 (п.7): брендовый диалог подтверждений */}
        {confirmDialog}
      </div>
    </Modal>
  );
}

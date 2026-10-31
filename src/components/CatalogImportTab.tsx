/**
 * План plans/2026-10-31-ux-audit-cleanup-dedup.md (п.2): вкладка «Импорт каталога»
 * раздела «Интеграции» — перенос вкладки «Импорт» демонтированной страницы-сироты
 * `/admin` (AdminPage). Стагинг-флоу прежний: черновики блюд из внешних источников
 * (GET /admin/staging), одобрение (POST :id/approve — блюдо уходит в каталог)
 * и отклонение с причиной (POST :id/reject). ADMIN-раздел (роут /integrations
 * защищён ProtectedRoute adminOnly).
 */
import { useCallback, useEffect, useState } from 'react';
import { Check, Download, X } from 'lucide-react';
import { api } from '../api/client';
import { useToast } from './ToastProvider';
import { Button } from './Button';
import PageLoader from './PageLoader';
import type { MealType } from '../types';
import { mealTypeLabels } from '../utils/text'; // cleanup-п.9

/** Черновик импорта в форме StagingRecipeResponse (backend) / mockStaging. */
export interface StagingRecipe {
  id: string | number;
  suggestedName: string | null;
  source: string;
  status: string;
  suggestedMealType?: MealType | null;
  /** backend отдаёт Map<String,Object>; mock/legacy — массив {mappedIngredientId, amount} */
  suggestedIngredients?: Array<{ mappedIngredientId?: string; amount: number }> | Record<string, unknown> | null;
  reviewedAt?: string | null;
  reviewedByEmail?: string | null;
  rejectionReason?: string | null;
  createdAt?: string;
}

// cleanup-п.9: mealTypeLabels — из utils/text (единый источник)

/** Приводим suggestedIngredients к массиву пар (обе формы контракта — см. тип). */
export function suggestedPairs(
  raw: StagingRecipe['suggestedIngredients'],
): Array<{ mappedIngredientId?: string; amount: number }> {
  if (Array.isArray(raw)) return raw;
  if (raw && typeof raw === 'object') {
    return Object.entries(raw).map(([k, v]) => ({
      mappedIngredientId: k,
      amount: Number(v) || 0,
    }));
  }
  return [];
}

export interface CatalogImportTabProps {
  /** причина отклонения — свой диалог вместо window.prompt (опционально) */
  askRejectReason?: (name: string) => Promise<string | null> | string | null;
}

export function CatalogImportTab({ askRejectReason }: CatalogImportTabProps) {
  const { showError, showSuccess } = useToast();
  const [stagingRecipes, setStagingRecipes] = useState<StagingRecipe[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await api.get<StagingRecipe[]>('/admin/staging');
      setStagingRecipes(Array.isArray(data) ? data : []);
    } catch (err) {
      // R10: сбой загрузки виден в консоли и пользователю; есть путь «Повторить»
      console.error('Failed to load staging recipes:', err);
      setStagingRecipes([]);
      setError('Не удалось загрузить черновики импорта');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadData(); }, [loadData]);

  const handleApprove = async (staging: StagingRecipe) => {
    try {
      await api.post(`/admin/staging/${staging.id}/approve`, {
        name: staging.suggestedName || 'Imported recipe',
        mealType: staging.suggestedMealType || 'DINNER',
        baseServings: 4,
        ingredients: suggestedPairs(staging.suggestedIngredients)
          .filter(si => si.mappedIngredientId)
          .map(si => ({ ingredientId: si.mappedIngredientId!, amount: si.amount })),
      });
      showSuccess('Блюдо одобрено и добавлено в каталог');
      await loadData();
    } catch (err: any) {
      console.error('Failed to approve staging recipe:', err);
      showError(err?.detail || 'Не удалось одобрить черновик');
    }
  };

  const handleReject = async (staging: StagingRecipe) => {
    // Наследие AdminPage — window.prompt; по умолчанию оставляем его же
    // (поведение переносится дословно), но страница может передать свой диалог.
    const reason = askRejectReason
      ? await askRejectReason(staging.suggestedName || 'Без названия')
      : window.prompt('Причина отклонения:');
    if (reason == null) return;
    try {
      await api.post(`/admin/staging/${staging.id}/reject`, { reason });
      showSuccess('Черновик отклонён');
      await loadData();
    } catch (err: any) {
      console.error('Failed to reject staging recipe:', err);
      showError(err?.detail || 'Не удалось отклонить черновик');
    }
  };

  if (loading) return <PageLoader label="Загружаем черновики…" />;

  if (error) {
    return (
      <div className="rounded-xl p-6 text-center" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
        <p style={{ color: 'var(--fire)' }}>{error}</p>
        <Button variant="ghost" onClick={() => void loadData()} className="mt-4" data-testid="import-retry">
          Повторить
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4" data-testid="catalog-import-tab">
      <p className="text-sm" style={{ color: 'var(--muted)' }}>
        Черновики блюд из внешних источников: одобрение добавляет блюдо в каталог
        («Блюда»), отклонение — с указанием причины.
      </p>

      {stagingRecipes.length === 0 && (
        <div className="text-center py-12 rounded-xl" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          <Download size={48} className="mx-auto mb-4" style={{ color: 'var(--muted)' }} />
          <p style={{ color: 'var(--muted)' }}>Нет черновиков для модерации</p>
        </div>
      )}

      {stagingRecipes.map(staging => (
        <div key={staging.id} className="rounded-xl p-5" style={{
          background: 'var(--surface)',
          border: `1px solid ${
            staging.status === 'PENDING' ? 'color-mix(in srgb, var(--amber-500) 30%, transparent)' :
            staging.status === 'APPROVED' ? 'color-mix(in srgb, var(--wave-400) 30%, transparent)' :
            'color-mix(in srgb, var(--danger) 30%, transparent)'
          }`,
        }} data-testid={`staging-card-${staging.id}`}>
          <div className="flex items-start justify-between mb-3 gap-3 flex-wrap">
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-bold" style={{ color: 'var(--text)' }}>{staging.suggestedName || 'Без названия'}</h3>
                <span className="px-2 py-0.5 text-xs font-medium rounded-full" style={{
                  background: staging.status === 'PENDING' ? 'color-mix(in srgb, var(--amber-500) 16%, transparent)' :
                    staging.status === 'APPROVED' ? 'var(--success-soft)' : 'var(--danger-soft)',
                  color: staging.status === 'PENDING' ? 'var(--amber-300)' :
                    staging.status === 'APPROVED' ? 'var(--wave-400)' : 'var(--danger)',
                }}>
                  {staging.status === 'PENDING' ? 'Ожидает' : staging.status === 'APPROVED' ? 'Одобрен' : 'Отклонён'}
                </span>
              </div>
              <p className="text-sm mt-1" style={{ color: 'var(--muted)' }}>Источник: {staging.source}</p>
              {staging.rejectionReason && (
                <p className="text-sm mt-1" style={{ color: 'var(--fire)' }}>Причина: {staging.rejectionReason}</p>
              )}
            </div>
            {staging.status === 'PENDING' && (
              <div className="flex gap-2">
                <Button variant="primary" size="sm" onClick={() => void handleApprove(staging)} data-testid={`staging-approve-${staging.id}`}>
                  <Check size={14} /> Одобрить
                </Button>
                <Button variant="danger" size="sm" onClick={() => void handleReject(staging)} data-testid={`staging-reject-${staging.id}`}>
                  <X size={14} /> Отклонить
                </Button>
              </div>
            )}
          </div>
          {staging.suggestedMealType && (
            <p className="text-sm" style={{ color: 'var(--muted)' }}>
              Тип: {mealTypeLabels[staging.suggestedMealType]}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}

export default CatalogImportTab;

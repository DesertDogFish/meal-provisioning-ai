import { useState, useMemo, useEffect, useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { PackagePlus, Pencil, Plus, Search, Trash2, Utensils, X } from 'lucide-react';
import { Flame } from 'lucide-react';

import { MealType } from '../types';
import { formatAmount } from '../utils/calculations';
import { humanizeCategory, servingsWord, ingredientsWord, mealTypeLabels, dishesWord, categoriesWord } from '../utils/text';
import CustomSelect from '../components/CustomSelect'; // Fix-5 (п.19): «Все категории» — как везде
import { api, getRecipes } from '../api/client';
import { useToast } from '../components/ToastProvider';
import { useConfirm } from '../components/ConfirmDialog'; // Fix-6 (п.7)
import Modal from '../components/Modal';
import PageHero from '../components/PageHero'; // BUG-002: hero-шапка страницы
import RecipeEditorModal from '../components/RecipeEditorModal';
import FilterSheet from '../components/FilterSheet';
import BottomSheet from '../components/BottomSheet';
import { Button } from '../components/Button';
import { useAuth } from '../components/AuthProvider'; // cleanup-п.7: роль — из контекста
import PageLoader from '../components/PageLoader';
export interface Recipe {
  id: string;
  name: string;
  mealType: MealType;
  category?: string;
  cookMinutes?: number;
  baseServings: number;
  caloriesPerServing?: number;
  source?: string;
  ingredients: any[];
}

// cleanup-п.9: mealTypeLabels — из utils/text (единый источник)
export function useRecipesPage(): any {
  const { showError, showSuccess } = useToast();
  const { confirm, dialog: confirmDialog } = useConfirm(); // Fix-6 (п.7)
  // U37 (список 26.10): переход из похода «Изменить блюдо в справочнике» ведёт на
  // /recipes?edit=<id> — редактор должен открыться СРАЗУ, а не искать блюдо руками.
  const [searchParams, setSearchParams] = useSearchParams();
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filterMealType, setFilterMealType] = useState<MealType | ''>('');
  const [filterCategory, setFilterCategory] = useState('');
  // navigation-п.6: фильтр по ингредиенту — deep-link /recipes?ingredient=<id>
  // из таблицы продуктов («В рецептах: N»). Параметр ЖИВЁТ в URL (shareable),
  // чистится только явным сбросом (✕ на чипе / «Сбросить фильтры»).
  const [filterIngredient, setFilterIngredient] = useState<string | null>(() => searchParams.get('ingredient'));
  const [noFireOnly, setNoFireOnly] = useState(false);
  const [selectedRecipe, setSelectedRecipe] = useState<string | null>(null);
  // подзадача 10 (30.10.2026): «В меню» — sheet с выбором похода и дня
  const [menuSheet, setMenuSheet] = useState<Recipe | null>(null);
  const [menuTrips, setMenuTrips] = useState<any[] | null>(null);
  const [menuTrip, setMenuTrip] = useState<any | null>(null);
  const navigate = useNavigate();
  const [visibleCount, setVisibleCount] = useState(24);
  // cleanup-п.7: роль для админ-действий каталога — из AuthContext
  // (ошибка /auth/me означает «не админ», а не поломку страницы — как раньше).
  const { isAdmin } = useAuth();
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingRecipe, setEditingRecipe] = useState<Recipe | null>(null);

  const openCreate = () => {
    setEditingRecipe(null);
    setEditorOpen(true);
  };

  const openEdit = (recipe: Recipe) => {
    setEditingRecipe(recipe);
    setSelectedRecipe(null);
    setEditorOpen(true);
  };

  const handleDelete = async (recipe: Recipe) => {
    // U16 (список багов 25.10) + Fix-6 (п.7): блюда — сущность верхнего уровня.
    // Походы с V20 живут на снапшотах рецептов, клиентская блокировка устарела —
    // сервер гарантирует изоляцию. Подтверждение — брендовым диалогом.
    const ok = await confirm({
      title: `Удалить блюдо «${recipe.name}»?`,
      confirmLabel: 'Удалить блюдо',
      message: (
        <>
          Блюдо удалится из справочника вместе с составом ({recipe.ingredients?.length ?? 0} позиций).
          Действие необратимо. Походы, уже спланированные с этим блюдом, не пострадают —
          они живут на копиях (снепшотах).
        </>
      ),
    });
    if (!ok) return;
    try {
      await api.del(`/admin/recipes/${recipe.id}`);
      showSuccess('Рецепт удалён');
      setSelectedRecipe(null);
      await loadRecipes();
    } catch (err: any) {
      showError(err?.detail || err?.message || 'Не удалось удалить рецепт');
    }
  };

  const loadRecipes = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await getRecipes();
      setRecipes(data);
    } catch (err: any) {
      console.error('Failed to load recipes:', err);
      // ЗАДАЧА 3: тост + сброс устаревшего каталога
      setRecipes([]);
      setError('Не удалось загрузить рецепты');
      showError(err?.detail || 'Не удалось загрузить рецепты');
    } finally {
      setLoading(false);
    }
  }, [showError]);

  useEffect(() => {
    loadRecipes();
  }, [loadRecipes]);

  // U37: авто-открытие редактора по ?edit=<recipeId> после загрузки каталога.
  // Параметр чистим сразу (replace), чтобы повторный рендер не открывал модалку вновь.
  useEffect(() => {
    const editId = searchParams.get('edit');
    if (!editId || loading || recipes.length === 0) return;
    const base = editId.includes('::t') ? editId.split('::t')[0] : editId;
    const target = recipes.find(r => String(r.id) === editId)
      ?? recipes.find(r => String(r.id) === base)
      ?? recipes.find(r => String((r as any).snapshotOf ?? '') === editId);
    dropParam('edit');
    if (target) openEdit(target);
    else showError('Блюдо для редактирования не найдено в каталоге');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, recipes, loading]);

  // navigation-п.5: ?view=<id> — открыть карточку блюда (deep-link из меню похода:
  // sheet снепшота → «В справочнике»). Резолв тот же, что у ?edit= (U37): прямой id,
  // mock-суффикс '::t…', snapshotOf-копия. Параметр чистим сразу (replace).
  useEffect(() => {
    const viewId = searchParams.get('view');
    if (!viewId || loading || recipes.length === 0) return;
    const base = viewId.includes('::t') ? viewId.split('::t')[0] : viewId;
    const target = recipes.find(r => String(r.id) === viewId)
      ?? recipes.find(r => String(r.id) === base)
      ?? recipes.find(r => String((r as any).snapshotOf ?? '') === viewId);
    dropParam('view');
    if (target) setSelectedRecipe(target.id);
    else showError('Блюдо не найдено в каталоге');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, recipes, loading]);

  // navigation-п.6: ?ingredient= — единственный «липкий» параметр фильтра; при
  // навигации внутри страницы (переход по ссылке «В рецептах» без размонтирования)
  // синхронизируем состояние с URL.
  useEffect(() => {
    const ing = searchParams.get('ingredient');
    setFilterIngredient(prev => (prev === ing ? prev : ing));
  }, [searchParams]);

  /** Убрать свой параметр из URL, НЕ затирая остальные (ingredient/edit/view). */
  const dropParam = useCallback((name: string) => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      next.delete(name);
      return next;
    }, { replace: true });
  }, [setSearchParams]);

  // Получить уникальные категории
  const categories = useMemo(() => {
    const cats = new Set(recipes.map(r => r.category).filter((c): c is string => Boolean(c)));
    return Array.from(cats).sort();
  }, [recipes]);

  // Фильтрация
  const filtered = useMemo(() => {
    return recipes.filter(r => {
      // Поиск по названию или ингредиентам
      if (search) {
        const searchLower = search.toLowerCase();
        const nameMatch = r.name.toLowerCase().includes(searchLower);
        const ingredientMatch = r.ingredients.some(ri => 
          ri.ingredient?.name.toLowerCase().includes(searchLower)
        );
        if (!nameMatch && !ingredientMatch) return false;
      }
      
      // Фильтр по типу приёма
      if (filterMealType && r.mealType !== filterMealType) return false;
      
      // Фильтр по категории
      if (filterCategory && r.category !== filterCategory) return false;

      // navigation-п.6: фильтр по ингредиенту (id продукта)
      if (filterIngredient) {
        const hit = (r.ingredients ?? []).some((ri: any) =>
          String(ri.ingredientId ?? ri.ingredient?.id ?? '') === String(filterIngredient));
        if (!hit) return false;
      }
      
      // Без огня (bugs-recipes-catalog п.2: прежде «Только без огня»)
      if (noFireOnly && r.cookMinutes !== 0) return false;
      
      return true;
    });
  }, [recipes, search, filterMealType, filterCategory, filterIngredient, noFireOnly]);

  // navigation-п.6: имя продукта для чипа — из состава любого подходящего рецепта
  const filterIngredientName = useMemo(() => {
    if (!filterIngredient) return null;
    for (const r of recipes) {
      for (const ri of (r.ingredients ?? []) as any[]) {
        if (String(ri.ingredientId ?? ri.ingredient?.id ?? '') === String(filterIngredient)) {
          return ri.ingredient?.name ?? ri.ingredientName ?? 'продукт';
        }
      }
    }
    return 'продукт';
  }, [recipes, filterIngredient]);

  // Подсчёт для чипов
  const counts = useMemo(() => {
    const all = recipes.length;
    const breakfast = recipes.filter(r => r.mealType === 'BREAKFAST').length;
    const lunch = recipes.filter(r => r.mealType === 'LUNCH').length;
    const dinner = recipes.filter(r => r.mealType === 'DINNER').length;
    const snack = recipes.filter(r => r.mealType === 'SNACK').length;
    const noFire = recipes.filter(r => r.cookMinutes === 0).length;
    return { all, breakfast, lunch, dinner, snack, noFire };
  }, [recipes]);

  const resetFilters = () => {
    setSearch('');
    setFilterMealType('');
    setFilterCategory('');
    setNoFireOnly(false);
    if (filterIngredient) {
      setFilterIngredient(null);
      dropParam('ingredient'); // navigation-п.6: сброс убирает параметр из URL
    }
  };

  const selected = recipes.find(r => r.id === selectedRecipe);

  return {
    categories,
    counts,
    dropParam,
    editingRecipe,
    editorOpen,
    error,
    filterCategory,
    filterIngredient,
    filterIngredientName,
    filterMealType,
    filtered,
    handleDelete,
    loadRecipes,
    loading,
    menuSheet,
    menuTrip,
    menuTrips,
    navigate,
    noFireOnly,
    openCreate,
    openEdit,
    recipes,
    resetFilters,
    search,
    searchParams,
    selected,
    selectedRecipe,
    setEditingRecipe,
    setEditorOpen,
    setError,
    setFilterCategory,
    setFilterIngredient,
    setFilterMealType,
    setLoading,
    setMenuSheet,
    setMenuTrip,
    setMenuTrips,
    setNoFireOnly,
    setRecipes,
    setSearch,
    setSearchParams,
    setSelectedRecipe,
    setVisibleCount,
    visibleCount,
    showError,
    showSuccess,
    confirm,
    confirmDialog,
    isAdmin,
  };
}

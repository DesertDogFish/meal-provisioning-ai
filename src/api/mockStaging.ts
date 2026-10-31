/**
 * План plans/2026-10-31-ux-audit-cleanup-dedup.md (п.2): стагинг импорта каталога
 * переехал с демонтированной страницы `/admin` (вкладка «Импорт») в раздел
 * «Интеграции» (таб «Импорт каталога»). Mock-паритет (R3): роуты повторяют
 * backend `StagingController` (/api/v1/admin/staging, ADMIN) —
 * GET список/по id, POST создание, POST :id/approve, POST :id/reject.
 *
 * Форма элемента — `StagingRecipeResponse`: id, source (RecipeSource),
 * rawPayload, status (PENDING|APPROVED|REJECTED), suggestedName,
 * suggestedMealType, suggestedIngredients, reviewedAt, reviewedByEmail,
 * rejectionReason, createdAt.
 */

export interface MockStagingRecipe {
  id: number;
  source: 'MANUAL' | 'ROSSTAT' | 'API' | 'AI';
  rawPayload: Record<string, unknown> | null;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  suggestedName: string | null;
  suggestedMealType: 'BREAKFAST' | 'LUNCH' | 'DINNER' | 'SNACK' | null;
  /**
   * Backend отдаёт Map<String,Object>; исторический UI читал массив
   * {mappedIngredientId, amount}. Mock сохраняет массивную форму (UI понимает
   * обе — см. CatalogImportTab.suggestedPairs).
   */
  suggestedIngredients: Array<{ mappedIngredientId?: string; amount: number }> | null;
  reviewedAt: string | null;
  reviewedByEmail: string | null;
  rejectionReason: string | null;
  createdAt: string;
}

let nextStagingId = 4;

function seedStaging(): MockStagingRecipe[] {
  return [
    {
      id: 1,
      source: 'AI',
      rawPayload: { prompt: 'походная каша' },
      status: 'PENDING',
      suggestedName: 'Каша гречневая с тушёнкой',
      suggestedMealType: 'DINNER',
      suggestedIngredients: [
        { mappedIngredientId: 'ing1', amount: 0.8 },
        { mappedIngredientId: 'ing2', amount: 1 },
      ],
      reviewedAt: null,
      reviewedByEmail: null,
      rejectionReason: null,
      createdAt: new Date(Date.now() - 3600_000).toISOString(),
    },
    {
      id: 2,
      source: 'API',
      rawPayload: { externalId: 'ext-42' },
      status: 'PENDING',
      suggestedName: 'Суп-пюре грибной',
      suggestedMealType: 'LUNCH',
      suggestedIngredients: [{ mappedIngredientId: 'ing3', amount: 1.5 }],
      reviewedAt: null,
      reviewedByEmail: null,
      rejectionReason: null,
      createdAt: new Date(Date.now() - 7200_000).toISOString(),
    },
    {
      id: 3,
      source: 'MANUAL',
      rawPayload: null,
      status: 'APPROVED',
      suggestedName: 'Чай с лимоном',
      suggestedMealType: 'SNACK',
      suggestedIngredients: [],
      reviewedAt: new Date(Date.now() - 86400_000).toISOString(),
      reviewedByEmail: 'admin@provision.app',
      rejectionReason: null,
      createdAt: new Date(Date.now() - 90000_000).toISOString(),
    },
  ];
}

/** Демо-сид: два черновика на модерацию и одна обработанная запись. */
let stagingRecipes: MockStagingRecipe[] = seedStaging();

/** Тесты/демо-сброс: вернуть сид-состояние. */
export function resetStagingSeed(): void {
  nextStagingId = 4;
  stagingRecipes = seedStaging();
}

export function tryStagingRoutes<T>(
  method: string,
  pathWithoutQuery: string,
  path: string,
  body?: any,
): { hit: true; result: T } | { hit: false } {
  if (!pathWithoutQuery.startsWith('/admin/staging')) return { hit: false };

  const query = path.includes('?') ? path.slice(path.indexOf('?') + 1) : '';
  const statusFilter = new URLSearchParams(query).get('status');

  // GET /admin/staging[?status=] — список (StagingController.getAllStagingRecipes)
  if (pathWithoutQuery === '/admin/staging' && method === 'GET') {
    const list = statusFilter
      ? stagingRecipes.filter(r => r.status === statusFilter)
      : stagingRecipes;
    return { hit: true, result: list.map(r => ({ ...r })) as T };
  }

  // POST /admin/staging — создание черновика (201)
  if (pathWithoutQuery === '/admin/staging' && method === 'POST') {
    const created: MockStagingRecipe = {
      id: nextStagingId++,
      source: (body?.source as MockStagingRecipe['source']) ?? 'MANUAL',
      rawPayload: body?.rawPayload ?? null,
      status: 'PENDING',
      suggestedName: body?.suggestedName ?? null,
      suggestedMealType: body?.suggestedMealType ?? null,
      suggestedIngredients: body?.suggestedIngredients ?? null,
      reviewedAt: null,
      reviewedByEmail: null,
      rejectionReason: null,
      createdAt: new Date().toISOString(),
    };
    stagingRecipes = [created, ...stagingRecipes];
    return { hit: true, result: { ...created } as T };
  }

  const byId = pathWithoutQuery.match(/^\/admin\/staging\/(\d+)$/);
  if (byId && method === 'GET') {
    const found = stagingRecipes.find(r => String(r.id) === byId[1]);
    if (!found) throw { status: 404, message: 'Not found', detail: `Staging recipe ${byId[1]} not found` } as any;
    return { hit: true, result: { ...found } as T };
  }

  // POST /admin/staging/:id/approve — void (200), статус → APPROVED
  const approve = pathWithoutQuery.match(/^\/admin\/staging\/(\d+)\/approve$/);
  if (approve && method === 'POST') {
    const target = stagingRecipes.find(r => String(r.id) === approve[1]);
    if (!target) throw { status: 404, message: 'Not found', detail: `Staging recipe ${approve[1]} not found` } as any;
    target.status = 'APPROVED';
    target.reviewedAt = new Date().toISOString();
    target.reviewedByEmail = 'admin@provision.app';
    target.rejectionReason = null;
    return { hit: true, result: undefined as T };
  }

  // POST /admin/staging/:id/reject — void (200), статус → REJECTED + причина
  const reject = pathWithoutQuery.match(/^\/admin\/staging\/(\d+)\/reject$/);
  if (reject && method === 'POST') {
    const target = stagingRecipes.find(r => String(r.id) === reject[1]);
    if (!target) throw { status: 404, message: 'Not found', detail: `Staging recipe ${reject[1]} not found` } as any;
    target.status = 'REJECTED';
    target.reviewedAt = new Date().toISOString();
    target.reviewedByEmail = 'admin@provision.app';
    target.rejectionReason = body?.reason ?? null;
    return { hit: true, result: undefined as T };
  }

  throw { status: 404, message: 'Not found', detail: `Route ${path} not implemented in mock` } as any;
}

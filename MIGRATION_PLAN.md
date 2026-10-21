# План миграции компонентов на API клиент

## 📅 Дата
2026-03-18

## 🎯 Цель
Мигрировать все компоненты с AppContext на API клиент с поддержкой режимов AUTO/FORCE_API/FORCE_MOCK.

---

## 📊 Статус миграции

### Батч 1: Auth и оболочка (4 компонента)
- [ ] LoginPage.tsx
- [ ] ProtectedRoute.tsx
- [ ] Layout.tsx (сессия)
- [ ] DashboardPage.tsx

### Батч 2: Каталог и админка (4 компонента)
- [ ] ProductsPage.tsx
- [ ] AdminPage.tsx (рецепты)
- [ ] IntegrationsPage.tsx
- [ ] BindingWizard.tsx

### Батч 3: Ядро похода (5 компонентов)
- [ ] TripsPage.tsx
- [ ] TripDetailPage.tsx
- [ ] PriceOverridesTab.tsx
- [ ] SubstitutionModal.tsx
- [ ] RecipesPage.tsx

---

## 🔧 Паттерн миграции

### До (с AppContext)
```typescript
import { useApp } from '../store/AppContext';

export default function MyComponent() {
  const { state, dispatch } = useApp();
  
  // Чтение данных
  const products = state.ingredients;
  
  // Запись данных
  const handleCreate = () => {
    dispatch({ type: 'ADD_INGREDIENT', payload: newProduct });
  };
  
  return <div>...</div>;
}
```

### После (с API клиентом)
```typescript
import { api } from '../api/client';
import { useState, useEffect } from 'react';

export default function MyComponent() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  // Чтение данных
  useEffect(() => {
    loadProducts();
  }, []);
  
  const loadProducts = async () => {
    try {
      setLoading(true);
      const data = await api.get('/admin/products');
      setProducts(data.content || data);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  };
  
  // Запись данных
  const handleCreate = async (newProduct) => {
    try {
      await api.post('/admin/products', newProduct);
      await loadProducts(); // Перезагрузка данных
    } catch (err) {
      setError(err);
    }
  };
  
  // Error/Loading состояния
  if (loading) return <div>Загрузка...</div>;
  if (error) return <div>Ошибка: {error.message}</div>;
  
  return <div>...</div>;
}
```

---

## 📦 Батч 1: Auth и оболочка

### 1.1 LoginPage.tsx

**Текущее использование AppContext:**
- Чтение: `state.currentUser`, `state.isAuthenticated`
- Запись: `dispatch({ type: 'LOGIN' })`, `dispatch({ type: 'LOGOUT' })`

**Миграция:**
```typescript
// Убрать
import { useApp } from '../store/AppContext';

// Добавить
import { api } from '../api/client';
import { useState } from 'react';

// Заменить
const { state, dispatch } = useApp();
const [currentUser, setCurrentUser] = useState(null);
const [isAuthenticated, setIsAuthenticated] = useState(false);

// Login
const handleLogin = async (email, password) => {
  try {
    const response = await api.post('/auth/login', { email, password });
    localStorage.setItem('accessToken', response.accessToken);
    localStorage.setItem('refreshToken', response.refreshToken);
    const user = await api.get('/auth/me');
    setCurrentUser(user);
    setIsAuthenticated(true);
    navigate('/dashboard');
  } catch (error) {
    showError(error.detail || 'Ошибка входа');
  }
};

// Logout
const handleLogout = async () => {
  try {
    const refreshToken = localStorage.getItem('refreshToken');
    await api.post('/auth/logout', { refreshToken });
  } catch (error) {
    console.error('Logout error:', error);
  } finally {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    setCurrentUser(null);
    setIsAuthenticated(false);
    navigate('/login');
  }
};
```

### 1.2 ProtectedRoute.tsx

**Текущее использование AppContext:**
- Чтение: `state.isAuthenticated`, `state.currentUser`

**Миграция:**
```typescript
// Убрать
import { useApp } from '../store/AppContext';

// Добавить
import { api } from '../api/client';
import { useState, useEffect } from 'react';

export default function ProtectedRoute({ children, adminOnly = false }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);
  
  useEffect(() => {
    checkAuth();
  }, []);
  
  const checkAuth = async () => {
    try {
      const token = localStorage.getItem('accessToken');
      if (!token) {
        setIsAuthenticated(false);
        return;
      }
      
      const user = await api.get('/auth/me');
      setCurrentUser(user);
      setIsAuthenticated(true);
    } catch (error) {
      setIsAuthenticated(false);
    } finally {
      setLoading(false);
    }
  };
  
  if (loading) return <div>Загрузка...</div>;
  
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }
  
  if (adminOnly && currentUser?.role !== 'ADMIN') {
    return <Navigate to="/dashboard" replace />;
  }
  
  return <>{children}</>;
}
```

### 1.3 Layout.tsx (сессия)

**Текущее использование AppContext:**
- Чтение: `state.currentUser`, `state.isAuthenticated`
- Запись: `dispatch({ type: 'LOGOUT' })`

**Миграция:**
```typescript
// Убрать
import { useApp } from '../store/AppContext';

// Добавить
import { useState, useEffect } from 'react';
import { api } from '../api/client';

export default function Layout({ children }) {
  const [currentUser, setCurrentUser] = useState(null);
  
  useEffect(() => {
    loadUser();
  }, []);
  
  const loadUser = async () => {
    try {
      const user = await api.get('/auth/me');
      setCurrentUser(user);
    } catch (error) {
      console.error('Failed to load user:', error);
    }
  };
  
  const handleLogout = async () => {
    try {
      const refreshToken = localStorage.getItem('refreshToken');
      await api.post('/auth/logout', { refreshToken });
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      localStorage.removeItem('accessToken');
      localStorage.removeItem('refreshToken');
      setCurrentUser(null);
      navigate('/login');
    }
  };
  
  const isAdmin = currentUser?.role === 'ADMIN';
  
  // ... остальной код
}
```

### 1.4 DashboardPage.tsx

**Текущее использование AppContext:**
- Чтение: `state.currentUser`, `state.trips`, `state.recipes`, `state.prices`

**Миграция:**
```typescript
// Убрать
import { useApp } from '../store/AppContext';

// Добавить
import { useState, useEffect } from 'react';
import { api } from '../api/client';

export default function DashboardPage() {
  const [currentUser, setCurrentUser] = useState(null);
  const [trips, setTrips] = useState([]);
  const [loading, setLoading] = useState(true);
  
  useEffect(() => {
    loadData();
  }, []);
  
  const loadData = async () => {
    try {
      setLoading(true);
      const [user, tripsData] = await Promise.all([
        api.get('/auth/me'),
        api.get('/trips')
      ]);
      setCurrentUser(user);
      setTrips(tripsData);
    } catch (error) {
      console.error('Failed to load data:', error);
    } finally {
      setLoading(false);
    }
  };
  
  if (loading) return <div>Загрузка...</div>;
  
  const myTrips = trips.filter(t => t.userId === currentUser?.id);
  
  // ... остальной код
}
```

---

## 📦 Батч 2: Каталог и админка

### 2.1 ProductsPage.tsx

**Текущее использование AppContext:**
- Чтение: `state.ingredients`, `state.categories`, `state.prices`
- Запись: `dispatch({ type: 'ADD_INGREDIENT' })`, `dispatch({ type: 'UPDATE_INGREDIENT' })`, `dispatch({ type: 'DELETE_INGREDIENT' })`

**Миграция:**
```typescript
// Убрать
import { useApp } from '../store/AppContext';

// Добавить
import { useState, useEffect } from 'react';
import { api } from '../api/client';

export default function ProductsPage() {
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  
  useEffect(() => {
    loadData();
  }, []);
  
  const loadData = async () => {
    try {
      setLoading(true);
      const [productsData, categoriesData] = await Promise.all([
        api.get('/admin/products'),
        api.get('/product-categories')
      ]);
      setProducts(productsData.content || productsData);
      setCategories(categoriesData);
    } catch (error) {
      console.error('Failed to load data:', error);
    } finally {
      setLoading(false);
    }
  };
  
  const handleCreate = async (productData) => {
    try {
      await api.post('/admin/products', productData);
      await loadData();
      showSuccess('Продукт создан');
    } catch (error) {
      showError(error.detail || 'Ошибка создания');
    }
  };
  
  const handleUpdate = async (id, productData) => {
    try {
      await api.put(`/admin/products/${id}`, productData);
      await loadData();
      showSuccess('Продукт обновлён');
    } catch (error) {
      showError(error.detail || 'Ошибка обновления');
    }
  };
  
  const handleDelete = async (id) => {
    if (!confirm('Удалить продукт?')) return;
    
    try {
      await api.del(`/admin/products/${id}`);
      await loadData();
      showSuccess('Продукт удалён');
    } catch (error) {
      showError(error.detail || 'Ошибка удаления');
    }
  };
  
  // ... остальной код
}
```

### 2.2 AdminPage.tsx (рецепты)

**Текущее использование AppContext:**
- Чтение: `state.recipes`, `state.ingredients`
- Запись: `dispatch({ type: 'ADD_RECIPE' })`, `dispatch({ type: 'UPDATE_RECIPE' })`, `dispatch({ type: 'DELETE_RECIPE' })`

**Миграция:**
```typescript
// Убрать
import { useApp } from '../store/AppContext';

// Добавить
import { useState, useEffect } from 'react';
import { api } from '../api/client';

export default function AdminPage() {
  const [recipes, setRecipes] = useState([]);
  const [ingredients, setIngredients] = useState([]);
  const [loading, setLoading] = useState(true);
  
  useEffect(() => {
    loadData();
  }, []);
  
  const loadData = async () => {
    try {
      setLoading(true);
      const [recipesData, ingredientsData] = await Promise.all([
        api.get('/recipes'),
        api.get('/admin/products')
      ]);
      setRecipes(recipesData);
      setIngredients(ingredientsData.content || ingredientsData);
    } catch (error) {
      console.error('Failed to load data:', error);
    } finally {
      setLoading(false);
    }
  };
  
  const handleCreateRecipe = async (recipeData) => {
    try {
      await api.post('/admin/recipes', recipeData);
      await loadData();
      showSuccess('Рецепт создан');
    } catch (error) {
      showError(error.detail || 'Ошибка создания');
    }
  };
  
  // ... остальной код
}
```

### 2.3 IntegrationsPage.tsx

**Текущее использование AppContext:**
- Чтение: `state.ingredients`

**Миграция:**
```typescript
// Убрать
import { useApp } from '../store/AppContext';

// Добавить
import { useState, useEffect } from 'react';
import { api } from '../api/client';

export default function IntegrationsPage() {
  const [ingredients, setIngredients] = useState([]);
  const [integrations, setIntegrations] = useState([]);
  const [loading, setLoading] = useState(true);
  
  useEffect(() => {
    loadData();
  }, []);
  
  const loadData = async () => {
    try {
      setLoading(true);
      const [ingredientsData, integrationsData] = await Promise.all([
        api.get('/admin/products'),
        api.get('/admin/integrations')
      ]);
      setIngredients(ingredientsData.content || ingredientsData);
      setIntegrations(integrationsData);
    } catch (error) {
      console.error('Failed to load data:', error);
    } finally {
      setLoading(false);
    }
  };
  
  // ... остальной код
}
```

### 2.4 BindingWizard.tsx

**Текущее использование AppContext:**
- Чтение: `state.ingredients`

**Миграция:**
```typescript
// Убрать
import { useApp } from '../store/AppContext';

// Добавить
import { useState, useEffect } from 'react';
import { api } from '../api/client';

export function BindingWizard({ onClose }) {
  const [ingredients, setIngredients] = useState([]);
  const [loading, setLoading] = useState(true);
  
  useEffect(() => {
    loadIngredients();
  }, []);
  
  const loadIngredients = async () => {
    try {
      setLoading(true);
      const data = await api.get('/admin/products?bound=false&sort=moneyWeight');
      setIngredients(data.items || data);
    } catch (error) {
      console.error('Failed to load ingredients:', error);
    } finally {
      setLoading(false);
    }
  };
  
  // ... остальной код
}
```

---

## 📦 Батч 3: Ядро похода

### 3.1 TripsPage.tsx

**Текущее использование AppContext:**
- Чтение: `state.trips`, `state.currentUser`
- Запись: `dispatch({ type: 'ADD_TRIP' })`, `dispatch({ type: 'DELETE_TRIP' })`

**Миграция:**
```typescript
// Убрать
import { useApp } from '../store/AppContext';

// Добавить
import { useState, useEffect } from 'react';
import { api } from '../api/client';

export default function TripsPage() {
  const [trips, setTrips] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);
  
  useEffect(() => {
    loadData();
  }, []);
  
  const loadData = async () => {
    try {
      setLoading(true);
      const [user, tripsData] = await Promise.all([
        api.get('/auth/me'),
        api.get('/trips')
      ]);
      setCurrentUser(user);
      setTrips(tripsData);
    } catch (error) {
      console.error('Failed to load data:', error);
    } finally {
      setLoading(false);
    }
  };
  
  const handleCreate = async (tripData) => {
    try {
      await api.post('/trips', tripData);
      await loadData();
      showSuccess('Поход создан');
    } catch (error) {
      showError(error.detail || 'Ошибка создания');
    }
  };
  
  const handleDelete = async (id) => {
    if (!confirm('Удалить поход?')) return;
    
    try {
      await api.del(`/trips/${id}`);
      await loadData();
      showSuccess('Поход удалён');
    } catch (error) {
      showError(error.detail || 'Ошибка удаления');
    }
  };
  
  // ... остальной код
}
```

### 3.2 TripDetailPage.tsx

**Текущее использование AppContext:**
- Чтение: `state.trips`, `state.recipes`, `state.prices`
- Запись: `dispatch({ type: 'UPDATE_DAY' })`, `dispatch({ type: 'ADD_MEAL' })`, `dispatch({ type: 'DELETE_MEAL' })`

**Миграция:**
```typescript
// Убрать
import { useApp } from '../store/AppContext';

// Добавить
import { useState, useEffect } from 'react';
import { api } from '../api/client';

export default function TripDetailPage() {
  const { id } = useParams();
  const [trip, setTrip] = useState(null);
  const [recipes, setRecipes] = useState([]);
  const [loading, setLoading] = useState(true);
  
  useEffect(() => {
    loadData();
  }, [id]);
  
  const loadData = async () => {
    try {
      setLoading(true);
      const [tripData, recipesData] = await Promise.all([
        api.get(`/trips/${id}`),
        api.get('/recipes')
      ]);
      setTrip(tripData);
      setRecipes(recipesData);
    } catch (error) {
      console.error('Failed to load data:', error);
    } finally {
      setLoading(false);
    }
  };
  
  const handleUpdateDay = async (dayId, dayData) => {
    try {
      await api.put(`/trips/${id}/days/${dayId}`, dayData);
      await loadData();
    } catch (error) {
      showError(error.detail || 'Ошибка обновления');
    }
  };
  
  const handleAddMeal = async (dayId, mealData) => {
    try {
      await api.post(`/trips/${id}/days/${dayId}/meals`, mealData);
      await loadData();
      showSuccess('Приём пищи добавлен');
    } catch (error) {
      showError(error.detail || 'Ошибка добавления');
    }
  };
  
  const handleDeleteMeal = async (dayId, mealId) => {
    try {
      await api.del(`/trips/${id}/days/${dayId}/meals/${mealId}`);
      await loadData();
      showSuccess('Приём пищи удалён');
    } catch (error) {
      showError(error.detail || 'Ошибка удаления');
    }
  };
  
  // ... остальной код
}
```

### 3.3 PriceOverridesTab.tsx

**Текущее использование AppContext:**
- Чтение: `state.trips`, `state.recipes`, `state.prices`

**Миграция:**
```typescript
// Убрать
import { useApp } from '../store/AppContext';

// Добавить
import { useState, useEffect } from 'react';
import { api } from '../api/client';

export default function PriceOverridesTab({ tripId }) {
  const [shoppingItems, setShoppingItems] = useState([]);
  const [overrides, setOverrides] = useState([]);
  const [loading, setLoading] = useState(true);
  
  useEffect(() => {
    loadData();
  }, [tripId]);
  
  const loadData = async () => {
    try {
      setLoading(true);
      const [shopping, overridesData] = await Promise.all([
        api.get(`/trips/${tripId}/summary/shopping`),
        api.get(`/trips/${tripId}/price-overrides`)
      ]);
      setShoppingItems(shopping.items);
      setOverrides(overridesData);
    } catch (error) {
      console.error('Failed to load data:', error);
    } finally {
      setLoading(false);
    }
  };
  
  // ... остальной код
}
```

### 3.4 SubstitutionModal.tsx

**Текущее использование AppContext:**
- Чтение: `state.ingredients`, `state.recipes`

**Миграция:**
```typescript
// Убрать
import { useApp } from '../store/AppContext';

// Добавить
import { useState, useEffect } from 'react';
import { api } from '../api/client';

export function SubstitutionModal({ tripId, recipeId, onClose }) {
  const [recipe, setRecipe] = useState(null);
  const [ingredients, setIngredients] = useState([]);
  const [loading, setLoading] = useState(true);
  
  useEffect(() => {
    loadData();
  }, [recipeId]);
  
  const loadData = async () => {
    try {
      setLoading(true);
      const [recipeData, ingredientsData] = await Promise.all([
        api.get(`/recipes/${recipeId}`),
        api.get('/admin/products')
      ]);
      setRecipe(recipeData);
      setIngredients(ingredientsData.content || ingredientsData);
    } catch (error) {
      console.error('Failed to load data:', error);
    } finally {
      setLoading(false);
    }
  };
  
  // ... остальной код
}
```

### 3.5 RecipesPage.tsx

**Текущее использование AppContext:**
- Чтение: `state.recipes`

**Миграция:**
```typescript
// Убрать
import { useApp } from '../store/AppContext';

// Добавить
import { useState, useEffect } from 'react';
import { api } from '../api/client';

export default function RecipesPage() {
  const [recipes, setRecipes] = useState([]);
  const [loading, setLoading] = useState(true);
  
  useEffect(() => {
    loadRecipes();
  }, []);
  
  const loadRecipes = async () => {
    try {
      setLoading(true);
      const data = await api.get('/recipes');
      setRecipes(data);
    } catch (error) {
      console.error('Failed to load recipes:', error);
    } finally {
      setLoading(false);
    }
  };
  
  // ... остальной код
}
```

---

## ✅ Критерии готовности компонента

После миграции каждого компонента проверить:

1. **grep по файлу пуст на AppContext:**
   ```bash
   grep -n "AppContext" src/pages/MyComponent.tsx
   # Должно быть пусто
   ```

2. **Экран работает в FORCE_MOCK:**
   - Установить режим FORCE_MOCK
   - Открыть экран
   - Данные должны загрузиться из мока

3. **Экран работает в FORCE_API:**
   - Запустить бэкенд
   - Установить режим FORCE_API
   - Открыть экран
   - Данные должны загрузиться из API

4. **Экран работает в AUTO:**
   - Установить режим AUTO
   - Открыть экран с бэкендом → зелёный бейдж
   - Остановить бэкенд → янтарный бейдж, данные из мока

5. **Error/Loading/Empty состояния:**
   - Loading: показывается спиннер/скелетон
   - Error: показывается сообщение об ошибке с кнопкой retry
   - Empty: показывается сообщение "Ничего не найдено"

---

## 🧪 Тестирование после каждого батча

После миграции каждого батча выполнить:

```bash
# 1. Линтинг
npm run lint

# 2. Тесты
npm test

# 3. Сборка
npm run build

# 4. Ручная проверка в превью
# - FORCE_MOCK: все экраны работают
# - FORCE_API: все экраны работают с бэкендом
# - AUTO: переключение работает

# 5. Ручная проверка локально
# - Запустить бэкенд
# - Проверить все экраны в обоих режимах
```

---

## 📝 Чек-лист миграции

### Батч 1
- [ ] LoginPage.tsx мигрирован
- [ ] ProtectedRoute.tsx мигрирован
- [ ] Layout.tsx мигрирован
- [ ] DashboardPage.tsx мигрирован
- [ ] grep пуст на AppContext
- [ ] npm run lint проходит
- [ ] npm test проходит
- [ ] npm run build проходит
- [ ] Ручная проверка в превью
- [ ] Ручная проверка локально

### Батч 2
- [ ] ProductsPage.tsx мигрирован
- [ ] AdminPage.tsx мигрирован
- [ ] IntegrationsPage.tsx мигрирован
- [ ] BindingWizard.tsx мигрирован
- [ ] grep пуст на AppContext
- [ ] npm run lint проходит
- [ ] npm test проходит
- [ ] npm run build проходит
- [ ] Ручная проверка в превью
- [ ] Ручная проверка локально

### Батч 3
- [ ] TripsPage.tsx мигрирован
- [ ] TripDetailPage.tsx мигрирован
- [ ] PriceOverridesTab.tsx мигрирован
- [ ] SubstitutionModal.tsx мигрирован
- [ ] RecipesPage.tsx мигрирован
- [ ] grep пуст на AppContext
- [ ] npm run lint проходит
- [ ] npm test проходит
- [ ] npm run build проходит
- [ ] Ручная проверка в превью
- [ ] Ручная проверка локально

---

## 🎯 Следующие шаги

После миграции всех компонентов:

1. **Удалить AppContext:**
   ```bash
   rm src/store/AppContext.tsx
   rm src/data/mockData.ts
   ```

2. **Обновить App.tsx:**
   ```typescript
   // Убрать
   import { AppProvider } from './store/AppContext';
   
   // Убрать обёртку
   <AppProvider>
     ...
   </AppProvider>
   ```

3. **Обновить mockServer.ts:**
   - Переместить данные из mockData.ts в mockSeed.ts
   - Обновить импорты

4. **Запустить финальные тесты:**
   - MODE-01..08
   - Контрактные тесты FIX-1/FIX-2

---

**Автор:** AI Assistant  
**Дата:** 2026-03-18  
**Версия:** 1.0  
**Статус:** ⚠️ ТРЕБУЕТСЯ МИГРАЦИЯ

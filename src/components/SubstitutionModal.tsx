import { useState } from 'react';
import { useToast } from './ToastProvider';
import { NumberField } from './NumberField';
import { api } from '../api/client';

interface Ingredient {
  id: string;
  name: string;
  category?: string;
}

interface RecipeIngredient {
  ingredientId: string;
  ingredientName: string;
  amount: number;
  unit: string;
}

interface Props {
  tripId: string;
  recipeId: string;
  recipeName: string;
  ingredients: RecipeIngredient[];
  onClose: () => void;
}

export function SubstitutionModal({ tripId, recipeId, recipeName, ingredients, onClose }: Props) {
  const { showSuccess, showError } = useToast();
  const [fromId, setFromId] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [ratio, setRatio] = useState<number | null>(1);
  const [similar, setSimilar] = useState<Ingredient[]>([]);
  const [searchResults, setSearchResults] = useState<Ingredient[]>([]);

  const loadSimilar = async (ingredientId: string) => {
    try {
      const data = await api.get<Ingredient[]>(`/ingredients/similar/${ingredientId}?limit=5`);
      setSimilar(data);
    } catch (error) {
      console.error('Failed to load similar ingredients:', error);
    }
  };

  const loadSearch = async (query: string) => {
    if (query.length < 2) {
      setSearchResults([]);
      return;
    }
    try {
      const data = await api.get<any>(`/admin/ingredients?query=${encodeURIComponent(query)}`);
      setSearchResults(data.items || []);
    } catch (error) {
      console.error('Failed to search ingredients:', error);
    }
  };

  const handleFromSelect = (ingredientId: string) => {
    setFromId(ingredientId);
    setRatio(1);
    loadSimilar(ingredientId);
  };

  const handleSearch = (query: string) => {
    setQ(query);
    loadSearch(query);
  };

  const handleSubstitute = async (toIngredientId: string) => {
    if (!fromId) return;
    try {
      await api.post(`/trips/${tripId}/substitutions`, {
        recipeId: parseInt(recipeId),
        fromIngredientId: parseInt(fromId),
        toIngredientId: parseInt(toIngredientId),
        ratio: ratio || 1,
        comment: q || null
      });
      showSuccess('Замена создана');
      onClose();
    } catch (error: any) {
      showError(error.detail || 'Failed to create substitution');
    }
  };

  const candidates = q.length > 1 ? searchResults : similar;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-sheet" onClick={e => e.stopPropagation()}>
        <b style={{ fontFamily: 'Unbounded', fontSize: '15px', color: 'var(--text)' }}>Замена компонента</b>
        <p style={{ color: 'var(--muted)', fontSize: '12px', margin: '6px 0 12px' }}>
          Действует только на этот поход: все приёмы пищи «{recipeName}» будут считать заменитель. 
          Каталог и другие походы не меняются.
        </p>

        <div className="grid grid-cols-2 gap-4">
          {/* Левая колонка: что заменяем */}
          <div>
            <p style={{ color: 'var(--muted)', fontSize: '12px', marginBottom: '6px' }}>Что заменяем</p>
            {ingredients.map(ri => (
              <div
                key={ri.ingredientId}
                className="rounded-xl p-3 mb-2 cursor-pointer transition-all"
                style={{
                  background: fromId === ri.ingredientId ? 'rgba(45, 212, 191, 0.12)' : 'var(--elev)',
                  border: fromId === ri.ingredientId ? '1px solid var(--w1)' : '1px solid var(--border)',
                  boxShadow: fromId === ri.ingredientId ? '0 0 18px rgba(45, 212, 191, 0.25)' : 'none'
                }}
                onClick={() => handleFromSelect(ri.ingredientId)}
              >
                <b style={{ color: 'var(--text)', fontSize: '13px' }}>{ri.ingredientName}</b>
                <span style={{ color: 'var(--muted)', fontSize: '12px', marginLeft: '8px' }}>
                  · {ri.amount}/чел
                </span>
              </div>
            ))}
          </div>

          {/* Правая колонка: на что */}
          <div>
            <p style={{ color: 'var(--muted)', fontSize: '12px', marginBottom: '6px' }}>На что</p>
            <input
              placeholder="Поиск или похожие ниже…"
              value={q}
              onChange={e => handleSearch(e.target.value)}
              className="w-full px-3 py-2 rounded-lg outline-none mb-2"
              style={{ background: 'var(--elev)', border: '1px solid var(--border)', color: 'var(--text)' }}
            />
            {candidates.map(c => (
              <div
                key={c.id}
                className="rounded-xl p-3 mb-2 cursor-pointer transition-all hover:scale-[1.02]"
                style={{ background: 'var(--elev)', border: '1px solid var(--border)' }}
                onClick={() => fromId && handleSubstitute(c.id)}
              >
                <b style={{ color: 'var(--text)', fontSize: '13px' }}>{c.name}</b>
                {c.category && (
                  <span className="chip-delta dim" style={{ marginLeft: '8px' }}>{c.category}</span>
                )}
              </div>
            ))}

            {/* Ratio */}
            <div className="flex gap-2 items-center mt-3">
              <span style={{ color: 'var(--muted)', fontSize: '12px' }}>Ratio</span>
              <NumberField
                value={ratio}
                stepRef={ratio}
                min={0.0001}
                maxDecimals={4}
                onCommit={v => setRatio(v ?? 1)}
                testId="sub-ratio"
              />
              <span style={{ color: 'var(--muted)', fontSize: '11px' }}>
                1 = 1:1 по весу; сушёные→свежие ≈ 0.1
              </span>
            </div>
          </div>
        </div>

        <div className="flex gap-3 mt-4">
          <button className="ghost-btn flex-1" onClick={onClose}>Отмена</button>
        </div>
      </div>
    </div>
  );
}

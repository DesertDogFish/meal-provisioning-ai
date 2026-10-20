import React, { createContext, useContext, useReducer, ReactNode } from 'react';
import { User, Ingredient, IngredientPrice, Recipe, Trip, StagingRecipe, IngredientMapping, MealType, UnitOfMeasure, RecipeSource } from '../types';
import { mockUsers, mockIngredients, mockPrices, mockRecipes, mockTrips, mockStagingRecipes, mockMappings } from '../data/mockData';

interface AppState {
  currentUser: User | null;
  isAuthenticated: boolean;
  ingredients: Ingredient[];
  prices: IngredientPrice[];
  recipes: Recipe[];
  trips: Trip[];
  stagingRecipes: StagingRecipe[];
  mappings: IngredientMapping[];
}

type Action =
  | { type: 'LOGIN'; payload: User }
  | { type: 'LOGOUT' }
  | { type: 'ADD_TRIP'; payload: Trip }
  | { type: 'UPDATE_TRIP'; payload: Trip }
  | { type: 'DELETE_TRIP'; payload: string }
  | { type: 'UPDATE_DAY'; payload: { tripId: string; dayId: string; peopleOverride?: number | null } }
  | { type: 'ADD_MEAL'; payload: { tripId: string; dayId: string; mealType: MealType; recipeId: string; peopleOverride?: number; sortOrder: number } }
  | { type: 'UPDATE_MEAL'; payload: { mealId: string; updates: Partial<{ mealType: MealType; recipeId: string; peopleOverride: number; sortOrder: number }> } }
  | { type: 'DELETE_MEAL'; payload: { tripId: string; dayId: string; mealId: string } }
  | { type: 'ADD_INGREDIENT'; payload: Ingredient }
  | { type: 'UPDATE_INGREDIENT'; payload: Ingredient }
  | { type: 'DELETE_INGREDIENT'; payload: string }
  | { type: 'ADD_PRICE'; payload: IngredientPrice }
  | { type: 'ADD_RECIPE'; payload: Recipe }
  | { type: 'UPDATE_RECIPE'; payload: Recipe }
  | { type: 'DELETE_RECIPE'; payload: string }
  | { type: 'ADD_STAGING'; payload: StagingRecipe }
  | { type: 'APPROVE_STAGING'; payload: { stagingId: string; recipe: Recipe } }
  | { type: 'REJECT_STAGING'; payload: { stagingId: string; reason: string } }
  | { type: 'ADD_MAPPING'; payload: IngredientMapping };

function generateId(): string {
  return Math.random().toString(36).substr(2, 9) + Date.now().toString(36);
}

function generateDates(startDate: string, endDate: string): string[] {
  const dates: string[] = [];
  const start = new Date(startDate);
  const end = new Date(endDate);
  const current = new Date(start);
  while (current <= end) {
    dates.push(current.toISOString().split('T')[0]);
    current.setDate(current.getDate() + 1);
  }
  return dates;
}

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'LOGIN':
      return { ...state, currentUser: action.payload, isAuthenticated: true };
    case 'LOGOUT':
      return { ...state, currentUser: null, isAuthenticated: false };
    case 'ADD_TRIP': {
      const dates = generateDates(action.payload.startDate, action.payload.endDate);
      const days = dates.map((date, i) => ({
        id: generateId(),
        tripId: action.payload.id,
        dayDate: date,
        meals: [] as any[],
      }));
      const trip = { ...action.payload, days };
      return { ...state, trips: [...state.trips, trip] };
    }
    case 'UPDATE_TRIP':
      return { ...state, trips: state.trips.map(t => t.id === action.payload.id ? { ...t, ...action.payload } : t) };
    case 'DELETE_TRIP':
      return { ...state, trips: state.trips.filter(t => t.id !== action.payload) };
    case 'UPDATE_DAY':
      return {
        ...state,
        trips: state.trips.map(t => {
          if (t.id !== action.payload.tripId) return t;
          return {
            ...t,
            days: (t.days || []).map(d =>
              d.id === action.payload.dayId
                ? { ...d, peopleOverride: action.payload.peopleOverride ?? undefined }
                : d
            )
          };
        })
      };
    case 'ADD_MEAL': {
      const { tripId, dayId, mealType, recipeId, peopleOverride, sortOrder } = action.payload;
      return {
        ...state,
        trips: state.trips.map(t => {
          if (t.id !== tripId) return t;
          return {
            ...t,
            days: (t.days || []).map(d => {
              if (d.id !== dayId) return d;
              return {
                ...d,
                meals: [...(d.meals || []), {
                  id: generateId(),
                  tripDayId: dayId,
                  mealType,
                  recipeId,
                  peopleOverride,
                  sortOrder,
                }]
              };
            })
          };
        })
      };
    }
    case 'UPDATE_MEAL':
      return {
        ...state,
        trips: state.trips.map(t => ({
          ...t,
          days: (t.days || []).map(d => ({
            ...d,
            meals: (d.meals || []).map(m =>
              m.id === action.payload.mealId
                ? { ...m, ...action.payload.updates }
                : m
            )
          }))
        }))
      };
    case 'DELETE_MEAL':
      return {
        ...state,
        trips: state.trips.map(t => {
          if (t.id !== action.payload.tripId) return t;
          return {
            ...t,
            days: (t.days || []).map(d => {
              if (d.id !== action.payload.dayId) return d;
              return { ...d, meals: (d.meals || []).filter(m => m.id !== action.payload.mealId) };
            })
          };
        })
      };
    case 'ADD_INGREDIENT':
      return { ...state, ingredients: [...state.ingredients, action.payload] };
    case 'UPDATE_INGREDIENT':
      return { ...state, ingredients: state.ingredients.map(i => i.id === action.payload.id ? action.payload : i) };
    case 'DELETE_INGREDIENT':
      return { ...state, ingredients: state.ingredients.filter(i => i.id !== action.payload) };
    case 'ADD_PRICE':
      return { ...state, prices: [...state.prices, action.payload] };
    case 'ADD_RECIPE':
      return { ...state, recipes: [...state.recipes, action.payload] };
    case 'UPDATE_RECIPE':
      return { ...state, recipes: state.recipes.map(r => r.id === action.payload.id ? action.payload : r) };
    case 'DELETE_RECIPE':
      return { ...state, recipes: state.recipes.filter(r => r.id !== action.payload) };
    case 'ADD_STAGING':
      return { ...state, stagingRecipes: [...state.stagingRecipes, action.payload] };
    case 'APPROVE_STAGING':
      return {
        ...state,
        stagingRecipes: state.stagingRecipes.map(s =>
          s.id === action.payload.stagingId
            ? { ...s, status: 'APPROVED' as const, reviewedAt: new Date().toISOString(), reviewedBy: state.currentUser?.id }
            : s
        ),
        recipes: [...state.recipes, action.payload.recipe]
      };
    case 'REJECT_STAGING':
      return {
        ...state,
        stagingRecipes: state.stagingRecipes.map(s =>
          s.id === action.payload.stagingId
            ? { ...s, status: 'REJECTED' as const, reviewedAt: new Date().toISOString(), reviewedBy: state.currentUser?.id, rejectionReason: action.payload.reason }
            : s
        )
      };
    case 'ADD_MAPPING':
      return { ...state, mappings: [...state.mappings, action.payload] };
    default:
      return state;
  }
}

const initialState: AppState = {
  currentUser: null,
  isAuthenticated: false,
  ingredients: mockIngredients,
  prices: mockPrices,
  recipes: mockRecipes.map(r => ({
    ...r,
    ingredients: r.ingredients.map(ri => ({
      ...ri,
      ingredient: mockIngredients.find(i => i.id === ri.ingredientId)
    }))
  })),
  trips: JSON.parse(JSON.stringify(mockTrips.map(t => ({
    ...t,
    days: t.days?.map(d => ({
      ...d,
      meals: d.meals?.map(m => ({
        ...m,
        recipe: mockRecipes.find(r => r.id === m.recipeId)
      }))
    }))
  })))) as Trip[],
  stagingRecipes: mockStagingRecipes,
  mappings: mockMappings,
};

const AppContext = createContext<{ state: AppState; dispatch: React.Dispatch<Action> } | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  return <AppContext.Provider value={{ state, dispatch }}>{children}</AppContext.Provider>;
}

export function useApp() {
  const context = useContext(AppContext);
  if (!context) throw new Error('useApp must be used within AppProvider');
  return context;
}

export { generateId, generateDates };

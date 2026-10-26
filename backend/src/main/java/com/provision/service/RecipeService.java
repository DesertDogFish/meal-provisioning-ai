package com.provision.service;

import com.provision.dto.recipe.RecipeRequest;
import com.provision.dto.recipe.RecipeResponse;
import com.provision.entity.*;
import com.provision.exception.ConflictException;
import com.provision.exception.NotFoundException;
import com.provision.repository.*;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.List;

@Service
@RequiredArgsConstructor
@Slf4j
public class RecipeService {

    private final RecipeRepository recipeRepository;
    private final com.provision.repository.TripRepository tripRepository;
    private final IngredientRepository ingredientRepository;
    private final TripMealRepository tripMealRepository;

    @Transactional(readOnly = true)
    public List<RecipeResponse> getAllRecipes() {
        return recipeRepository.findAllWithIngredients().stream()
                .map(this::toResponse)
                .toList();
    }

    @Transactional(readOnly = true)
    public List<RecipeResponse> getRecipesWithFilters(
            MealType mealType,
            String category,
            Integer cookMinutes,
            String search
    ) {
        // FIX (интеграционные тесты CAT-01/02): при всех фильтрах == null JPQL-запрос
        // findWithFilters содержит LOWER(CONCAT('%', :search, '%')) с не типизированным
        // NULL-параметром -> PostgreSQL выводит lower(bytea) и падает (500 на GET /recipes
        // без query-параметров). Без фильтров идём в готовый findAllWithIngredients.
        if (mealType == null && category == null && cookMinutes == null
                && (search == null || search.isBlank())) {
            return recipeRepository.findAllWithIngredients().stream()
                    .map(this::toResponse)
                    .toList();
        }
        return recipeRepository.findWithFilters(mealType, category, cookMinutes, search).stream()
                .map(this::toResponse)
                .toList();
    }

    @Transactional(readOnly = true)
    public RecipeResponse getRecipe(Long id) {
        Recipe recipe = recipeRepository.findByIdWithIngredients(id);
        if (recipe == null) {
            throw new NotFoundException("Recipe not found with id: " + id);
        }
        return toResponse(recipe);
    }

    @Transactional
    public RecipeResponse createRecipe(RecipeRequest request) {
        Recipe recipe = Recipe.builder()
                .name(request.name())
                .mealType(request.mealType())
                .category(request.category())
                .cookMinutes(request.cookMinutes() != null ? request.cookMinutes() : 0)
                .baseServings(request.baseServings())
                .caloriesPerServing(request.caloriesPerServing())
                .source(RecipeSource.MANUAL)
                .ingredients(new ArrayList<>())
                .build();

        for (RecipeRequest.RecipeIngredientItem item : request.ingredients()) {
            Ingredient ingredient = ingredientRepository.findById(item.ingredientId())
                    .orElseThrow(() -> new NotFoundException("Ingredient not found with id: " + item.ingredientId()));

            RecipeIngredient recipeIngredient = RecipeIngredient.builder()
                    .recipe(recipe)
                    .ingredient(ingredient)
                    .amount(item.amount())
                    .build();

            recipe.getIngredients().add(recipeIngredient);
        }

        recipe = recipeRepository.save(recipe);
        log.info("Created recipe: {}", recipe.getName());
        return toResponse(recipe);
    }

    @Transactional
    public RecipeResponse updateRecipe(Long id, RecipeRequest request) {
        Recipe recipe = recipeRepository.findByIdWithIngredients(id);
        if (recipe == null) {
            throw new NotFoundException("Recipe not found with id: " + id);
        }

        recipe.setName(request.name());
        recipe.setMealType(request.mealType());
        recipe.setCategory(request.category());
        recipe.setCookMinutes(request.cookMinutes() != null ? request.cookMinutes() : 0);
        recipe.setBaseServings(request.baseServings());
        recipe.setCaloriesPerServing(request.caloriesPerServing());

        // Fix-4 (список 26.10): раньше clear() + повторный add тех же ингредиентов
        // давал 500 «An unexpected error occurred» на ЛЮБОМ блюде с существующим
        // составом: Hibernate flush'ит INSERT раньше DELETE коллекции и упирается
        // в unique(recipe_id, ingredient_id). Теперь дифф на месте:
        //  - существующая строка → обновляем amount (UPDATE);
        //  - отсутствующая в запросе → удаляем (orphanRemoval DELETE);
        //  - новая → добавляем (INSERT без коллизии).
        // Дубли ingredientId в запросе: побеждает последнее значение amount.
        java.util.Map<Long, RecipeIngredient> existingByIngredient = new java.util.HashMap<>();
        for (RecipeIngredient ri : recipe.getIngredients()) {
            existingByIngredient.put(ri.getIngredient().getId(), ri);
        }
        java.util.Set<Long> keepIngredientIds = new java.util.HashSet<>();
        for (RecipeRequest.RecipeIngredientItem item : request.ingredients()) {
            Ingredient ingredient = ingredientRepository.findById(item.ingredientId())
                    .orElseThrow(() -> new NotFoundException("Ingredient not found with id: " + item.ingredientId()));

            RecipeIngredient existing = existingByIngredient.get(ingredient.getId());
            if (existing != null) {
                existing.setAmount(item.amount());
            } else {
                recipe.getIngredients().add(RecipeIngredient.builder()
                        .recipe(recipe)
                        .ingredient(ingredient)
                        .amount(item.amount())
                        .build());
            }
            keepIngredientIds.add(ingredient.getId());
        }
        recipe.getIngredients().removeIf(ri -> !keepIngredientIds.contains(ri.getIngredient().getId()));

        recipe = recipeRepository.save(recipe);
        log.info("Updated recipe: {}", recipe.getName());
        return toResponse(recipe);
    }

    @Transactional
    public void deleteRecipe(Long id) {
        Recipe recipe = recipeRepository.findByIdWithIngredients(id);
        if (recipe == null) {
            throw new NotFoundException("Recipe not found with id: " + id);
        }

        // Проверка использования в походах
        if (tripMealRepository.existsByRecipeId(id)) {
            throw new ConflictException("Recipe is used in trip meals and cannot be deleted");
        }

        recipeRepository.deleteById(id);
        log.info("Deleted recipe: {}", recipe.getName());
    }

    /**
     * V20: trip-scoped копии блюд похода (для рендера меню и клиентских расчётов
     * страниц похода: meal.recipeId указывает на копию, которой нет в глобальном
     * каталоге GET /recipes).
     */
    @org.springframework.transaction.annotation.Transactional(readOnly = true)
    public java.util.List<RecipeResponse> getTripRecipes(Long tripId, Long userId) {
        tripRepository.findByIdAndUserId(tripId, userId)
                .orElseThrow(() -> new com.provision.exception.NotFoundException("Trip not found or access denied"));
        java.util.List<Long> copyIds = recipeRepository.findByTripId(tripId).stream()
                .map(Recipe::getId)
                .toList();
        if (copyIds.isEmpty()) {
            return java.util.List.of();
        }
        return recipeRepository.findAllWithIngredientsByIds(copyIds).stream()
                .map(this::toResponse)
                .toList();
    }

    private RecipeResponse toResponse(Recipe recipe) {
        List<RecipeResponse.RecipeIngredientResponse> ingredients = recipe.getIngredients().stream()
                .map(ri -> {
                    String unitLabel = com.provision.dto.product.ProductResponse.UNIT_LABELS
                        .getOrDefault(ri.getIngredient().getUnit(), ri.getIngredient().getUnit().name());
                    com.provision.entity.Ingredient ing = ri.getIngredient();
                    return new RecipeResponse.RecipeIngredientResponse(
                            ing.getId(),
                            ing.getName(),
                            ing.getUnit(),
                            unitLabel,
                            ri.getAmount(),
                            // Fix-2 (п.3/4): категория/фасовка для чека и чеклиста.
                            // category LAZY — батчинг через hibernate.default_batch_fetch_size
                            ing.getCategory() != null ? ing.getCategory().getName() : null,
                            ing.getPackSize(),
                            ing.getRoundToPacks(),
                            ing.getPieceWeightG(),
                            ing.getKcalPer100g()
                    );
                })
                .toList();

        // CR-1: расчёт калорийности из продуктов
        com.provision.util.KcalCalculator.KcalResult kcalResult = 
            com.provision.util.KcalCalculator.calculateRecipeKcal(
                recipe.getIngredients(), recipe.getBaseServings());

        return new RecipeResponse(
                recipe.getId(),
                recipe.getName(),
                recipe.getMealType(),
                recipe.getCategory(),
                recipe.getCookMinutes(),
                recipe.getBaseServings(),
                recipe.getCaloriesPerServing(),
                kcalResult.caloriesPerServing(),
                kcalResult.missingKcalIngredients(),
                recipe.getSource(),
                ingredients,
                recipe.getCreatedAt()
        );
    }
}

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

        // Очищаем старые ингредиенты
        recipe.getIngredients().clear();

        // Добавляем новые
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

    private RecipeResponse toResponse(Recipe recipe) {
        List<RecipeResponse.RecipeIngredientResponse> ingredients = recipe.getIngredients().stream()
                .map(ri -> new RecipeResponse.RecipeIngredientResponse(
                        ri.getIngredient().getId(),
                        ri.getIngredient().getName(),
                        ri.getIngredient().getUnit(),
                        ri.getAmount()
                ))
                .toList();

        return new RecipeResponse(
                recipe.getId(),
                recipe.getName(),
                recipe.getMealType(),
                recipe.getCategory(),
                recipe.getCookMinutes(),
                recipe.getBaseServings(),
                recipe.getCaloriesPerServing(),
                recipe.getSource(),
                ingredients,
                recipe.getCreatedAt()
        );
    }
}

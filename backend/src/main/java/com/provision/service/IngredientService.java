package com.provision.service;

import com.provision.dto.ingredient.*;
import com.provision.entity.Ingredient;
import com.provision.entity.Recipe;
import com.provision.exception.ConflictException;
import com.provision.exception.NotFoundException;
import com.provision.repository.IngredientRepository;
import com.provision.repository.RecipeRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
@RequiredArgsConstructor
@Slf4j
public class IngredientService {

    private final IngredientRepository ingredientRepository;
    private final RecipeRepository recipeRepository;

    @Transactional(readOnly = true)
    public List<IngredientResponse> getAllIngredients() {
        return ingredientRepository.findAllOrderByname().stream()
                .map(this::toResponse)
                .toList();
    }

    @Transactional(readOnly = true)
    public IngredientResponse getIngredient(Long id) {
        Ingredient ingredient = ingredientRepository.findById(id)
                .orElseThrow(() -> new NotFoundException("Ingredient not found with id: " + id));
        return toResponse(ingredient);
    }

    @Transactional
    public IngredientResponse createIngredient(IngredientRequest request) {
        if (ingredientRepository.existsByName(request.name())) {
            throw new ConflictException("Ingredient with name already exists: " + request.name());
        }

        Ingredient ingredient = Ingredient.builder()
                .name(request.name())
                .unit(request.unit())
                .category(request.category())
                .caloriesPerUnit(request.caloriesPerUnit())
                .build();

        ingredient = ingredientRepository.save(ingredient);
        log.info("Created ingredient: {}", ingredient.getName());
        return toResponse(ingredient);
    }

    @Transactional
    public IngredientResponse updateIngredient(Long id, IngredientRequest request) {
        Ingredient ingredient = ingredientRepository.findById(id)
                .orElseThrow(() -> new NotFoundException("Ingredient not found with id: " + id));

        // Проверка использования в рецептах
        List<Long> recipeIds = recipeRepository.findAll().stream()
                .filter(r -> r.getIngredients().stream()
                        .anyMatch(ri -> ri.getIngredient().getId().equals(id)))
                .map(Recipe::getId)
                .toList();

        if (!recipeIds.isEmpty()) {
            throw new ConflictException(
                    "Ingredient is used in " + recipeIds.size() + " recipe(s) and cannot be modified"
            );
        }

        ingredient.setName(request.name());
        ingredient.setUnit(request.unit());
        ingredient.setCategory(request.category());
        ingredient.setCaloriesPerUnit(request.caloriesPerUnit());

        ingredient = ingredientRepository.save(ingredient);
        log.info("Updated ingredient: {}", ingredient.getName());
        return toResponse(ingredient);
    }

    @Transactional
    public void deleteIngredient(Long id) {
        Ingredient ingredient = ingredientRepository.findById(id)
                .orElseThrow(() -> new NotFoundException("Ingredient not found with id: " + id));

        // Проверка использования в рецептах
        List<Long> recipeIds = recipeRepository.findAll().stream()
                .filter(r -> r.getIngredients().stream()
                        .anyMatch(ri -> ri.getIngredient().getId().equals(id)))
                .map(Recipe::getId)
                .toList();

        if (!recipeIds.isEmpty()) {
            throw new ConflictException(
                    "Ingredient is used in " + recipeIds.size() + " recipe(s) and cannot be deleted"
            );
        }

        ingredientRepository.deleteById(id);
        log.info("Deleted ingredient: {}", ingredient.getName());
    }

    private IngredientResponse toResponse(Ingredient ingredient) {
        return new IngredientResponse(
                ingredient.getId(),
                ingredient.getName(),
                ingredient.getUnit(),
                ingredient.getCategory(),
                ingredient.getCaloriesPerUnit(),
                ingredient.getCreatedAt()
        );
    }
}

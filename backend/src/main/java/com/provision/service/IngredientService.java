package com.provision.service;

import com.provision.dto.PageResponse;
import com.provision.dto.ingredient.*;
import com.provision.entity.Ingredient;
import com.provision.entity.Recipe;
import com.provision.exception.ConflictException;
import com.provision.exception.NotFoundException;
import com.provision.repository.IngredientRepository;
import com.provision.repository.ProductCategoryRepository;
import com.provision.repository.RecipeRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
@RequiredArgsConstructor
@Slf4j
public class IngredientService {

    private final IngredientRepository ingredientRepository;
    private final RecipeRepository recipeRepository;
    private final ProductCategoryRepository categoryRepository;

    @Transactional(readOnly = true)
    public List<IngredientResponse> getAllIngredients() {
        return ingredientRepository.findAllOrderByname().stream()
                .map(this::toResponse)
                .toList();
    }

    @Transactional(readOnly = true)
    public PageResponse<IngredientResponse> getIngredientsPaginated(int page, int size, String sortBy, String sortDir) {
        Sort sort = sortDir.equalsIgnoreCase("desc") 
            ? Sort.by(sortBy).descending() 
            : Sort.by(sortBy).ascending();
        Pageable pageable = PageRequest.of(page, size, sort);
        
        Page<Ingredient> ingredientPage = ingredientRepository.findAll(pageable);
        List<IngredientResponse> content = ingredientPage.getContent().stream()
                .map(this::toResponse)
                .toList();
        
        return PageResponse.of(
            content,
            page,
            size,
            ingredientPage.getTotalElements()
        );
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

        if (request.code() != null && ingredientRepository.existsByCode(request.code())) {
            throw new ConflictException("Ingredient with code already exists: " + request.code());
        }

        // Для deprecated API используем категорию "Прочее" по умолчанию
        var defaultCategory = categoryRepository.findByName("Прочее")
                .orElseThrow(() -> new NotFoundException("Default category not found"));
        
        String nameNorm = request.name().toLowerCase()
                .replace('ё', 'е')
                .replaceAll("\\s+", " ")
                .trim();
        
        Ingredient ingredient = Ingredient.builder()
                .code(request.code())
                .name(request.name())
                .nameNorm(nameNorm)
                .unit(request.unit())
                .category(defaultCategory)
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

        String nameNorm = request.name().toLowerCase()
                .replace('ё', 'е')
                .replaceAll("\\s+", " ")
                .trim();
        
        ingredient.setName(request.name());
        ingredient.setNameNorm(nameNorm);
        ingredient.setUnit(request.unit());
        // Категория не меняется в deprecated API
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
                ingredient.getCode(),
                ingredient.getName(),
                ingredient.getUnit(),
                ingredient.getCategory().getName(),
                ingredient.getCaloriesPerUnit(),
                ingredient.getCreatedAt()
        );
    }
}

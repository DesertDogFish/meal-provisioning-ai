package com.provision.service;

import com.provision.dto.staging.*;
import com.provision.entity.*;
import com.provision.exception.ConflictException;
import com.provision.exception.NotFoundException;
import com.provision.repository.*;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

@Service
@RequiredArgsConstructor
@Slf4j
public class StagingService {

    private final StagingRecipeRepository stagingRecipeRepository;
    private final RecipeRepository recipeRepository;
    private final IngredientRepository ingredientRepository;
    private final UserRepository userRepository;

    @Transactional(readOnly = true)
    public List<StagingRecipeResponse> getAllStagingRecipes() {
        return stagingRecipeRepository.findAllByOrderByCreatedAtDesc().stream()
                .map(this::toResponse)
                .toList();
    }

    @Transactional(readOnly = true)
    public List<StagingRecipeResponse> getStagingRecipesByStatus(String status) {
        return stagingRecipeRepository.findByStatusOrderByCreatedAtDesc(status).stream()
                .map(this::toResponse)
                .toList();
    }

    @Transactional(readOnly = true)
    public StagingRecipeResponse getStagingRecipe(Long id) {
        StagingRecipe staging = stagingRecipeRepository.findById(id)
                .orElseThrow(() -> new NotFoundException("Staging recipe not found with id: " + id));
        return toResponse(staging);
    }

    @Transactional
    public StagingRecipeResponse createStagingRecipe(StagingRecipeRequest request) {
        StagingRecipe staging = StagingRecipe.builder()
                .source(request.source())
                .rawPayload(request.rawPayload())
                .status("PENDING")
                .suggestedName(request.suggestedName())
                .suggestedMealType(request.suggestedMealType())
                .suggestedIngredients(request.suggestedIngredients())
                .build();

        staging = stagingRecipeRepository.save(staging);
        log.info("Created staging recipe: {}", staging.getId());
        return toResponse(staging);
    }

    @Transactional
    public void approveStagingRecipe(Long id, ApproveStagingRequest request, Long reviewerId) {
        StagingRecipe staging = stagingRecipeRepository.findById(id)
                .orElseThrow(() -> new NotFoundException("Staging recipe not found with id: " + id));

        if (!"PENDING".equals(staging.getStatus())) {
            throw new ConflictException("Staging recipe is not in PENDING status");
        }

        User reviewer = userRepository.findById(reviewerId)
                .orElseThrow(() -> new NotFoundException("User not found with id: " + reviewerId));

        // Создаём рецепт из staging
        Recipe recipe = Recipe.builder()
                .name(request.name())
                .mealType(request.mealType())
                .baseServings(request.baseServings())
                .caloriesPerServing(request.caloriesPerServing())
                .source(staging.getSource())
                .ingredients(new ArrayList<>())
                .build();

        // Добавляем ингредиенты
        for (ApproveStagingRequest.ApprovedIngredient ing : request.ingredients()) {
            Ingredient ingredient = ingredientRepository.findById(ing.ingredientId())
                    .orElseThrow(() -> new NotFoundException("Ingredient not found with id: " + ing.ingredientId()));

            RecipeIngredient recipeIngredient = RecipeIngredient.builder()
                    .recipe(recipe)
                    .ingredient(ingredient)
                    .amount(ing.amount())
                    .build();

            recipe.getIngredients().add(recipeIngredient);
        }

        recipeRepository.save(recipe);

        // Обновляем staging
        staging.setStatus("APPROVED");
        staging.setReviewedAt(LocalDateTime.now());
        staging.setReviewedBy(reviewer);
        stagingRecipeRepository.save(staging);

        log.info("Approved staging recipe: {} -> Recipe: {}", id, recipe.getId());
    }

    @Transactional
    public void rejectStagingRecipe(Long id, RejectStagingRequest request, Long reviewerId) {
        StagingRecipe staging = stagingRecipeRepository.findById(id)
                .orElseThrow(() -> new NotFoundException("Staging recipe not found with id: " + id));

        if (!"PENDING".equals(staging.getStatus())) {
            throw new ConflictException("Staging recipe is not in PENDING status");
        }

        User reviewer = userRepository.findById(reviewerId)
                .orElseThrow(() -> new NotFoundException("User not found with id: " + reviewerId));

        staging.setStatus("REJECTED");
        staging.setRejectionReason(request.reason());
        staging.setReviewedAt(LocalDateTime.now());
        staging.setReviewedBy(reviewer);
        stagingRecipeRepository.save(staging);

        log.info("Rejected staging recipe: {}", id);
    }

    private StagingRecipeResponse toResponse(StagingRecipe staging) {
        return new StagingRecipeResponse(
                staging.getId(),
                staging.getSource(),
                staging.getRawPayload(),
                staging.getStatus(),
                staging.getSuggestedName(),
                staging.getSuggestedMealType(),
                staging.getSuggestedIngredients(),
                staging.getReviewedAt(),
                staging.getReviewedBy() != null ? staging.getReviewedBy().getEmail() : null,
                staging.getRejectionReason(),
                staging.getCreatedAt()
        );
    }
}

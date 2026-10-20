package com.provision.service;

import com.provision.dto.trip.SubstitutionRequest;
import com.provision.dto.trip.SubstitutionResponse;
import com.provision.entity.*;
import com.provision.exception.NotFoundException;
import com.provision.repository.*;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
@RequiredArgsConstructor
@Slf4j
public class SubstitutionService {

    private final TripIngredientSubstitutionRepository substitutionRepository;
    private final TripRepository tripRepository;
    private final RecipeRepository recipeRepository;
    private final IngredientRepository ingredientRepository;
    private final UserRepository userRepository;

    @Transactional(readOnly = true)
    public List<SubstitutionResponse> getSubstitutions(Long tripId, Long userId) {
        Trip trip = tripRepository.findById(tripId)
                .orElseThrow(() -> new NotFoundException("Trip not found"));

        if (!trip.getUser().getId().equals(userId)) {
            throw new NotFoundException("Trip not found");
        }

        return substitutionRepository.findByTripIdWithIngredients(tripId).stream()
                .map(this::toResponse)
                .toList();
    }

    @Transactional
    public SubstitutionResponse createSubstitution(
            Long tripId,
            SubstitutionRequest request,
            Long userId
    ) {
        Trip trip = tripRepository.findById(tripId)
                .orElseThrow(() -> new NotFoundException("Trip not found"));

        if (!trip.getUser().getId().equals(userId)) {
            throw new NotFoundException("Trip not found");
        }

        Recipe recipe = recipeRepository.findById(request.recipeId())
                .orElseThrow(() -> new NotFoundException("Recipe not found"));

        Ingredient fromIngredient = ingredientRepository.findById(request.fromIngredientId())
                .orElseThrow(() -> new NotFoundException("From ingredient not found"));

        Ingredient toIngredient = ingredientRepository.findById(request.toIngredientId())
                .orElseThrow(() -> new NotFoundException("To ingredient not found"));

        User user = userRepository.findById(userId)
                .orElseThrow(() -> new NotFoundException("User not found"));

        // Проверяем, что from и to разные
        if (request.fromIngredientId().equals(request.toIngredientId())) {
            throw new IllegalArgumentException("From and to ingredients must be different");
        }

        // Проверяем, что замена не существует
        substitutionRepository.findByTripIdAndRecipeIdAndFromIngredientId(
                tripId, request.recipeId(), request.fromIngredientId()
        ).ifPresent(existing -> {
            throw new IllegalStateException("Substitution already exists for this ingredient in this recipe");
        });

        TripIngredientSubstitution substitution = TripIngredientSubstitution.builder()
                .trip(trip)
                .recipe(recipe)
                .fromIngredient(fromIngredient)
                .toIngredient(toIngredient)
                .ratio(request.ratio())
                .comment(request.comment())
                .createdBy(user)
                .build();

        substitution = substitutionRepository.save(substitution);
        log.info("Created substitution for trip {} recipe {} from {} to {}", 
                tripId, request.recipeId(), request.fromIngredientId(), request.toIngredientId());

        return toResponse(substitution);
    }

    @Transactional
    public void deleteSubstitution(Long tripId, Long substitutionId, Long userId) {
        Trip trip = tripRepository.findById(tripId)
                .orElseThrow(() -> new NotFoundException("Trip not found"));

        if (!trip.getUser().getId().equals(userId)) {
            throw new NotFoundException("Trip not found");
        }

        TripIngredientSubstitution substitution = substitutionRepository.findById(substitutionId)
                .orElseThrow(() -> new NotFoundException("Substitution not found"));

        if (!substitution.getTrip().getId().equals(tripId)) {
            throw new NotFoundException("Substitution not found");
        }

        substitutionRepository.delete(substitution);
        log.info("Deleted substitution {} for trip {}", substitutionId, tripId);
    }

    private SubstitutionResponse toResponse(TripIngredientSubstitution substitution) {
        return new SubstitutionResponse(
                substitution.getId(),
                substitution.getRecipe().getId(),
                substitution.getRecipe().getName(),
                substitution.getFromIngredient().getId(),
                substitution.getFromIngredient().getName(),
                substitution.getToIngredient().getId(),
                substitution.getToIngredient().getName(),
                substitution.getRatio(),
                substitution.getComment(),
                substitution.getCreatedBy() != null ? substitution.getCreatedBy().getEmail() : null,
                substitution.getCreatedAt()
        );
    }
}

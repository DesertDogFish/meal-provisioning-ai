package com.provision.service;

import com.provision.dto.trip.SubstitutionRequest;
import com.provision.dto.trip.TripIngredientEditRequest;
import com.provision.dto.trip.TripIngredientEditResponse;
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

    // ================= Фаза 14 (N3): пер-походные правки состава =================

    /** Все правки состава похода (замены + добавления + удаления) одним списком. */
    @Transactional(readOnly = true)
    public List<TripIngredientEditResponse> getEdits(Long tripId, Long userId) {
        verifyOwnership(tripId, userId);
        return substitutionRepository.findAllEditsForTrip(tripId).stream()
                .map(this::toEditResponse)
                .toList();
    }

    /**
     * Создание правки: замена (from+to), добавление руками (from=null, to+amountPerServing)
     * или мягкое удаление из расчёта (to=null). Каталог (recipes) не трогается.
     */
    @Transactional
    public TripIngredientEditResponse createEdit(Long tripId, TripIngredientEditRequest request, Long userId) {
        Trip trip = verifyOwnership(tripId, userId);

        Recipe recipe = recipeRepository.findById(request.recipeId())
                .orElseThrow(() -> new NotFoundException("Recipe not found"));

        Ingredient from = request.fromIngredientId() == null ? null
                : ingredientRepository.findById(request.fromIngredientId())
                        .orElseThrow(() -> new NotFoundException("From ingredient not found"));
        Ingredient to = request.toIngredientId() == null ? null
                : ingredientRepository.findById(request.toIngredientId())
                        .orElseThrow(() -> new NotFoundException("To ingredient not found"));

        if (from == null && to == null) {
            throw new IllegalArgumentException("fromIngredientId or toIngredientId required");
        }
        if (from != null && to != null && from.getId().equals(to.getId())) {
            throw new IllegalArgumentException("From and to ingredients must be different");
        }

        boolean isAdd = from == null;
        boolean isRemove = to == null;

        if (isAdd) {
            if (request.amountPerServing() == null || request.amountPerServing().signum() <= 0) {
                throw new IllegalArgumentException("amountPerServing must be positive for added lines");
            }
            substitutionRepository.findByTripIdAndRecipeIdAndAddedTrueAndToIngredientId(
                    tripId, recipe.getId(), to.getId()).ifPresent(existing -> {
                throw new IllegalStateException("Product already added to this dish in this trip");
            });
        } else {
            substitutionRepository.findByTripIdAndRecipeIdAndFromIngredientId(
                    tripId, recipe.getId(), from.getId()).ifPresent(existing -> {
                throw new IllegalStateException("This position already has a trip-level edit");
            });
        }

        User user = userRepository.findById(userId)
                .orElseThrow(() -> new NotFoundException("User not found"));

        TripIngredientSubstitution edit = TripIngredientSubstitution.builder()
                .trip(trip)
                .recipe(recipe)
                .fromIngredient(from)
                .toIngredient(to)
                .ratio(request.ratio() != null ? request.ratio() : java.math.BigDecimal.ONE)
                .amountPerServing(request.amountPerServing())
                .added(isAdd)
                .removed(isRemove)
                .comment(request.comment())
                .createdBy(user)
                .build();

        return toEditResponse(substitutionRepository.save(edit));
    }

    @Transactional
    public void deleteEdit(Long tripId, Long editId, Long userId) {
        verifyOwnership(tripId, userId);
        TripIngredientSubstitution edit = substitutionRepository.findById(editId)
                .orElseThrow(() -> new NotFoundException("Edit not found"));
        if (!edit.getTrip().getId().equals(tripId)) {
            throw new NotFoundException("Edit not found");
        }
        substitutionRepository.delete(edit);
    }

    private Trip verifyOwnership(Long tripId, Long userId) {
        Trip trip = tripRepository.findById(tripId)
                .orElseThrow(() -> new NotFoundException("Trip not found"));
        if (!trip.getUser().getId().equals(userId)) {
            throw new NotFoundException("Trip not found");
        }
        return trip;
    }

    private TripIngredientEditResponse toEditResponse(TripIngredientSubstitution s) {
        return new TripIngredientEditResponse(
                s.getId(),
                s.getRecipe().getId(),
                s.getRecipe().getName(),
                s.getFromIngredient() != null ? s.getFromIngredient().getId() : null,
                s.getFromIngredient() != null ? s.getFromIngredient().getName() : null,
                s.getToIngredient() != null ? s.getToIngredient().getId() : null,
                s.getToIngredient() != null ? s.getToIngredient().getName() : null,
                s.getRatio(),
                s.getAmountPerServing(),
                s.isAdded(),
                s.isRemoved(),
                s.getComment(),
                s.getCreatedAt()
        );
    }
}

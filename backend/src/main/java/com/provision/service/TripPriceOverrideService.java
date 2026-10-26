package com.provision.service;

import com.provision.dto.trip.TripPriceOverrideRequest;
import com.provision.dto.trip.TripPriceOverrideResponse;
import com.provision.entity.Ingredient;
import com.provision.entity.Trip;
import com.provision.entity.TripPriceOverride;
import com.provision.entity.User;
import com.provision.exception.NotFoundException;
import com.provision.repository.IngredientRepository;
import com.provision.repository.TripPriceOverrideRepository;
import com.provision.repository.TripRepository;
import com.provision.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
@RequiredArgsConstructor
@Slf4j
public class TripPriceOverrideService {

    private final TripPriceOverrideRepository overrideRepository;
    private final TripRepository tripRepository;
    private final IngredientRepository ingredientRepository;
    private final UserRepository userRepository;

    @Transactional(readOnly = true)
    public List<TripPriceOverrideResponse> getOverrides(Long tripId, Long userId) {
        Trip trip = tripRepository.findById(tripId)
                .orElseThrow(() -> new NotFoundException("Trip not found"));

        if (!trip.getUser().getId().equals(userId)) {
            throw new NotFoundException("Trip not found");
        }

        return overrideRepository.findByTripId(tripId).stream()
                .map(this::toResponse)
                .toList();
    }

    @Transactional
    public TripPriceOverrideResponse createOrUpdateOverride(
            Long tripId,
            Long ingredientId,
            TripPriceOverrideRequest request,
            Long userId
    ) {
        Trip trip = tripRepository.findById(tripId)
                .orElseThrow(() -> new NotFoundException("Trip not found"));

        if (!trip.getUser().getId().equals(userId)) {
            throw new NotFoundException("Trip not found");
        }

        Ingredient ingredient = ingredientRepository.findById(ingredientId)
                .orElseThrow(() -> new NotFoundException("Ingredient not found"));

        // V20: расчётное ядро работает с trip-scoped снепшотами продуктов, поэтому чек,
        // введённый на ГЛОБАЛЬНЫЙ id (UI может прислать id из справочника), редиректится
        // на снепшот того же продукта в этом походе. Иначе оверрайд молча не применялся:
        // «ввёл чек — факт не изменился». Trip-scope чужого похода — не существует здесь.
        if (ingredient.getTripId() == null) {
            ingredient = ingredientRepository.findByTripIdAndSnapshotOf(tripId, ingredient.getId())
                    .orElse(ingredient);
        } else if (!ingredient.getTripId().equals(tripId)) {
            throw new NotFoundException("Ingredient not found");
        }

        User user = userRepository.findById(userId)
                .orElseThrow(() -> new NotFoundException("User not found"));

        TripPriceOverride override = overrideRepository
                .findByTripIdAndIngredientId(tripId, ingredient.getId())
                .orElse(TripPriceOverride.builder()
                        .trip(trip)
                        .ingredient(ingredient)
                        .build());

        override.setActualPrice(request.actualPrice());
        override.setComment(request.comment());
        override.setUpdatedBy(user);

        override = overrideRepository.save(override);
        log.info("Created/updated price override for trip {} ingredient {}: {}", 
                tripId, ingredientId, request.actualPrice());

        return toResponse(override);
    }

    @Transactional
    public void deleteOverride(Long tripId, Long ingredientId, Long userId) {
        Trip trip = tripRepository.findById(tripId)
                .orElseThrow(() -> new NotFoundException("Trip not found"));

        if (!trip.getUser().getId().equals(userId)) {
            throw new NotFoundException("Trip not found");
        }

        overrideRepository.deleteByTripIdAndIngredientId(tripId, ingredientId);
        // V20: чек мог быть записан на снепшот (редирект при вводе на глобальный id) —
        // удаляем и его, чтобы DELETE по любому из id был полным.
        ingredientRepository.findById(ingredientId)
                .filter(i -> i.getTripId() == null)
                .flatMap(i -> ingredientRepository.findByTripIdAndSnapshotOf(tripId, i.getId()))
                .ifPresent(snap -> overrideRepository.deleteByTripIdAndIngredientId(tripId, snap.getId()));
        log.info("Deleted price override for trip {} ingredient {}", tripId, ingredientId);
    }

    private TripPriceOverrideResponse toResponse(TripPriceOverride override) {
        return new TripPriceOverrideResponse(
                override.getId(),
                override.getIngredient().getId(),
                override.getIngredient().getName(),
                override.getActualPrice(),
                override.getCurrency(),
                override.getComment(),
                override.getUpdatedBy() != null ? override.getUpdatedBy().getEmail() : null,
                override.getUpdatedAt()
        );
    }
}

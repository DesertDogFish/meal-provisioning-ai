package com.provision.service;

import com.provision.entity.*;
import com.provision.exception.NotFoundException;
import com.provision.repository.*;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

/** Фаза 14: мягкие исключения продуктов из расчёта закупки похода (persist-слой). */
@Service
@RequiredArgsConstructor
public class TripShoppingExclusionService {

    private final TripShoppingExclusionRepository exclusionRepository;
    private final TripRepository tripRepository;
    private final IngredientRepository ingredientRepository;

    private Trip getOwnedTrip(Long tripId, Long userId) {
        Trip trip = tripRepository.findById(tripId)
                .orElseThrow(() -> new NotFoundException("Trip not found"));
        if (!trip.getUser().getId().equals(userId)) {
            throw new NotFoundException("Trip not found");
        }
        return trip;
    }

    @Transactional(readOnly = true)
    public List<Long> list(Long tripId, Long userId) {
        getOwnedTrip(tripId, userId);
        return exclusionRepository.findByTripId(tripId).stream()
                .map(e -> e.getIngredient().getId())
                .toList();
    }

    /** Полная замена набора исключений (идемпотентный PUT из UI-стейджа). */
    @Transactional
    public List<Long> replaceAll(Long tripId, List<Long> ingredientIds, Long userId) {
        Trip trip = getOwnedTrip(tripId, userId);
        exclusionRepository.deleteAllByTripId(tripId);
        for (Long ingId : ingredientIds) {
            Ingredient ing = ingredientRepository.findById(ingId)
                    .orElseThrow(() -> new NotFoundException("Ingredient not found: " + ingId));
            exclusionRepository.save(TripShoppingExclusion.builder()
                    .trip(trip).ingredient(ing).build());
        }
        return ingredientIds;
    }

    @Transactional
    public void add(Long tripId, Long ingredientId, Long userId) {
        Trip trip = getOwnedTrip(tripId, userId);
        if (exclusionRepository.findByTripIdAndIngredientId(tripId, ingredientId).isPresent()) return;
        Ingredient ing = ingredientRepository.findById(ingredientId)
                .orElseThrow(() -> new NotFoundException("Ingredient not found: " + ingredientId));
        exclusionRepository.save(TripShoppingExclusion.builder()
                .trip(trip).ingredient(ing).build());
    }

    @Transactional
    public void remove(Long tripId, Long ingredientId, Long userId) {
        getOwnedTrip(tripId, userId);
        exclusionRepository.deleteByTripIdAndIngredientId(tripId, ingredientId);
    }
}

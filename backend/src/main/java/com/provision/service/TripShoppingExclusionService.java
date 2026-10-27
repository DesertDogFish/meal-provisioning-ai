package com.provision.service;

import com.provision.entity.*;
import com.provision.exception.NotFoundException;
import com.provision.repository.*;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.provision.dto.trip.ShoppingExclusionDtos;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;

/** Фаза 14: мягкие исключения продуктов из расчёта закупки похода (persist-слой).
 * Fix-5 / R2 (шаг 2): поддержка по-дневных исключений (dayDate != null). */
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
    public List<ShoppingExclusionDtos.ExclusionItem> list(Long tripId, Long userId) {
        getOwnedTrip(tripId, userId);
        return exclusionRepository.findByTripId(tripId).stream()
                .map(e -> new ShoppingExclusionDtos.ExclusionItem(
                        e.getIngredient().getId(), e.getDayDate()))
                .toList();
    }

    /**
     * Полная замена набора исключений (идемпотентный PUT из UI-стейджа).
     * Принимает и legacy-список id (все глобальные), и канонические items с dayDate.
     */
    @Transactional
    public List<ShoppingExclusionDtos.ExclusionItem> replaceAll(
            Long tripId, ShoppingExclusionDtos.ExclusionsBody body, Long userId) {
        Trip trip = getOwnedTrip(tripId, userId);

        List<ShoppingExclusionDtos.ExclusionItem> desired = new ArrayList<>();
        if (body != null) {
            if (body.ingredientIds() != null) {
                for (Long id : body.ingredientIds()) {
                    desired.add(new ShoppingExclusionDtos.ExclusionItem(id, null));
                }
            }
            if (body.items() != null) {
                for (ShoppingExclusionDtos.ExclusionItem it : body.items()) {
                    if (it != null && it.ingredientId() != null) {
                        desired.add(new ShoppingExclusionDtos.ExclusionItem(it.ingredientId(), it.dayDate()));
                    }
                }
            }
        }

        exclusionRepository.deleteAllByTripId(tripId);
        for (ShoppingExclusionDtos.ExclusionItem it : desired) {
            Ingredient ing = ingredientRepository.findById(it.ingredientId())
                    .orElseThrow(() -> new NotFoundException("Ingredient not found: " + it.ingredientId()));
            exclusionRepository.save(TripShoppingExclusion.builder()
                    .trip(trip).ingredient(ing).dayDate(it.dayDate()).build());
        }
        return desired;
    }

    @Transactional
    public void add(Long tripId, Long ingredientId, Long userId) {
        Trip trip = getOwnedTrip(tripId, userId);
        if (exclusionRepository.findByTripIdAndIngredientIdAndDayDateIsNull(tripId, ingredientId).isPresent()) {
            return;
        }
        Ingredient ing = ingredientRepository.findById(ingredientId)
                .orElseThrow(() -> new NotFoundException("Ingredient not found: " + ingredientId));
        exclusionRepository.save(TripShoppingExclusion.builder()
                .trip(trip).ingredient(ing).dayDate((LocalDate) null).build());
    }

    @Transactional
    public void remove(Long tripId, Long ingredientId, Long userId) {
        getOwnedTrip(tripId, userId);
        exclusionRepository.deleteByTripIdAndIngredientId(tripId, ingredientId);
    }
}

package com.provision.controller;

import com.provision.dto.ingredient.IngredientPriceResponse;
import com.provision.entity.Ingredient;
import com.provision.entity.IngredientPrice;
import com.provision.entity.User;
import com.provision.exception.NotFoundException;
import com.provision.repository.IngredientPriceRepository;
import com.provision.repository.IngredientRepository;
import com.provision.repository.TripRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDate;
import java.util.Comparator;
import java.util.List;

/**
 * V20: цены КОНКРЕТНОГО похода — по trip-scoped копиям продуктов (замороженный план).
 * Формат ответа идентичен GET /api/v1/prices, чтобы вкладки похода (закупки, чеки)
 * могли потреблять его без изменений формы.
 *
 * Fallback: у походов без снепшотов (созданы до V20 / сиды без snow-сервиса)
 * trip-scoped продуктов нет — отдаём глобальный срез, чтобы UI не ломался.
 */
@RestController
@RequestMapping("/api/v1/trips/{tripId}/prices")
@RequiredArgsConstructor
public class TripPriceController {

    private final TripRepository tripRepository;
    private final IngredientRepository ingredientRepository;
    private final IngredientPriceRepository priceRepository;

    @GetMapping
    @Transactional(readOnly = true)
    public List<IngredientPriceResponse> getTripPrices(
            @PathVariable Long tripId,
            @RequestParam(required = false) LocalDate asOf,
            @AuthenticationPrincipal User user
    ) {
        tripRepository.findByIdAndUserId(tripId, user.getId())
                .orElseThrow(() -> new NotFoundException("Trip not found or access denied"));

        LocalDate cutoff = asOf != null ? asOf : LocalDate.now();
        List<Long> snapshotIds = ingredientRepository.findByTripId(tripId).stream()
                .map(Ingredient::getId)
                .toList();

        List<IngredientPrice> latest = snapshotIds.isEmpty()
                ? priceRepository.findLatestGlobalPricesAsOf(cutoff)
                : priceRepository.findLatestPricesAsOfForIngredients(cutoff, snapshotIds);

        return latest.stream()
                .map(p -> new IngredientPriceResponse(
                        p.getId(),
                        p.getIngredient().getId(),
                        p.getIngredient().getName(),
                        p.getPricePerUnit(),
                        p.getCurrency(),
                        p.getEffectiveFrom(),
                        p.getCreatedAt()))
                .sorted(Comparator.comparing(IngredientPriceResponse::ingredientId))
                .toList();
    }
}

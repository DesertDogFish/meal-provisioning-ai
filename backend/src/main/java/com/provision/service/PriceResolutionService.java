package com.provision.service;

import com.provision.entity.IngredientPrice;
import com.provision.entity.TripPriceOverride;
import com.provision.repository.IngredientPriceRepository;
import com.provision.repository.TripPriceOverrideRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import com.provision.entity.Ingredient;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
@Slf4j
@Transactional(readOnly = true)
public class PriceResolutionService {

    private final IngredientPriceRepository priceRepository;
    private final TripPriceOverrideRepository overrideRepository;

    /**
     * Получить плановую цену ингредиента на конкретную дату
     */
    public Optional<BigDecimal> getPlannedPrice(Long ingredientId, LocalDate date) {
        return priceRepository.findEffectivePrice(ingredientId, date)
                .map(IngredientPrice::getPricePerUnit);
    }

    /**
     * Получить фактическую цену (оверрайд) ингредиента для похода
     */
    public Optional<BigDecimal> getActualPrice(Long tripId, Long ingredientId) {
        return overrideRepository.findByTripIdAndIngredientId(tripId, ingredientId)
                .map(TripPriceOverride::getActualPrice);
    }

    /**
     * Получить все оверрайды для похода.
     *
     * FIX (V20 copy-on-write, E2E-ECON-01 EK-07 «факт 806.3 вместо 816.3»): UI/API пишет
     * trip_price_overrides на id ГЛОБАЛЬНОГО ингредиента (PUT /trips/{tripId}/price-overrides/
     * {ingredientId} — пользователь выбирает продукт из справочника), а расчётное ядро
     * (SummaryService.computeShopping) резолвит оверрайд по id строки рецепта блюда — после
     * V20 это trip-scoped снепшот с ДРУГИМ id. Без дублирования ключа override никогда не
     * применялся к походам со снепшотами. Регистрируем запись и под id оригинала
     * (snapshotOf), и под id самого снепшота; merge-function оставляет первое значение —
     * поведение для глобальных ингредиентов (snapshotOf == null) не меняется.
     */
    public Map<Long, BigDecimal> getAllOverrides(Long tripId) {
        Map<Long, BigDecimal> result = new HashMap<>();
        for (TripPriceOverride override : overrideRepository.findByTripId(tripId)) {
            BigDecimal price = override.getActualPrice();
            if (price == null) {
                continue;
            }
            Ingredient ingredient = override.getIngredient();
            Long snapshotId = ingredient.getId();
            result.putIfAbsent(snapshotId, price);
            if (ingredient.getSnapshotOf() != null) {
                result.putIfAbsent(ingredient.getSnapshotOf(), price);
            }
        }
        return result;
    }

    /**
     * Разрешить цену: фактическая (если есть) или плановая
     */
    public PriceResolution resolvePrice(Long tripId, Long ingredientId, LocalDate date) {
        Optional<BigDecimal> actualPrice = getActualPrice(tripId, ingredientId);
        Optional<BigDecimal> plannedPrice = getPlannedPrice(ingredientId, date);

        return new PriceResolution(
                plannedPrice.orElse(null),
                actualPrice.orElse(plannedPrice.orElse(null)),
                actualPrice.isPresent(),
                plannedPrice.isPresent()
        );
    }

    /**
     * Результат разрешения цены
     */
    public record PriceResolution(
            BigDecimal plannedPrice,
            BigDecimal actualPrice,
            boolean hasOverride,
            boolean hasPlannedPrice
    ) {
        public boolean hasAnyPrice() {
            return actualPrice != null;
        }
    }
}

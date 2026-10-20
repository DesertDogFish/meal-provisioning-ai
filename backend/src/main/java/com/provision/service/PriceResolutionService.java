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
     * Получить все оверрайды для похода
     */
    public Map<Long, BigDecimal> getAllOverrides(Long tripId) {
        return overrideRepository.findByTripId(tripId).stream()
                .collect(Collectors.toMap(
                        override -> override.getIngredient().getId(),
                        TripPriceOverride::getActualPrice
                ));
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

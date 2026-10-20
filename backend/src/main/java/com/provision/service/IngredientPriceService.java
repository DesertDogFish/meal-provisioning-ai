package com.provision.service;

import com.provision.dto.ingredient.IngredientPriceRequest;
import com.provision.dto.ingredient.IngredientPriceResponse;
import com.provision.entity.Ingredient;
import com.provision.entity.IngredientPrice;
import com.provision.exception.ConflictException;
import com.provision.exception.NotFoundException;
import com.provision.repository.IngredientPriceRepository;
import com.provision.repository.IngredientRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
@RequiredArgsConstructor
@Slf4j
public class IngredientPriceService {

    private final IngredientPriceRepository priceRepository;
    private final IngredientRepository ingredientRepository;

    @Transactional(readOnly = true)
    public List<IngredientPriceResponse> getPricesByIngredient(Long ingredientId) {
        return priceRepository.findByIngredientIdOrderByEffectiveFromDesc(ingredientId).stream()
                .map(this::toResponse)
                .toList();
    }

    @Transactional
    public IngredientPriceResponse addPrice(IngredientPriceRequest request) {
        Ingredient ingredient = ingredientRepository.findById(request.ingredientId())
                .orElseThrow(() -> new NotFoundException("Ingredient not found with id: " + request.ingredientId()));

        // Проверка дубликата
        if (priceRepository.existsByIngredientIdAndEffectiveFrom(request.ingredientId(), request.effectiveFrom())) {
            throw new ConflictException(
                    "Price already exists for ingredient " + ingredient.getName() + 
                    " on date " + request.effectiveFrom()
            );
        }

        IngredientPrice price = IngredientPrice.builder()
                .ingredient(ingredient)
                .pricePerUnit(request.pricePerUnit())
                .currency(request.currency())
                .effectiveFrom(request.effectiveFrom())
                .build();

        price = priceRepository.save(price);
        log.info("Added price for ingredient {}: {} {}", ingredient.getName(), request.pricePerUnit(), request.currency());
        return toResponse(price);
    }

    private IngredientPriceResponse toResponse(IngredientPrice price) {
        return new IngredientPriceResponse(
                price.getId(),
                price.getIngredient().getId(),
                price.getIngredient().getName(),
                price.getPricePerUnit(),
                price.getCurrency(),
                price.getEffectiveFrom(),
                price.getCreatedAt()
        );
    }
}

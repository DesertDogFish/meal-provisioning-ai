package com.provision.controller;

import com.provision.dto.ingredient.IngredientPriceResponse;
import com.provision.entity.IngredientPrice;
import com.provision.entity.User;
import com.provision.repository.IngredientPriceRepository;
import com.provision.repository.RecipeIngredientRepository;
import com.provision.repository.TripMealRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * P0-3 (real-режим): публичный read-only список цен для ВСЕХ аутентифицированных
 * пользователей.
 *
 * Предыстория: фронтенд (TripDetailPage, PriceOverridesTab) грузил цены с
 * GET /admin/prices, которого на бэкенде не существует вовсе; реальный список
 * цен был только на /api/v1/admin/ingredient-prices и только для ADMIN.
 * В real-режиме любая страница похода падала с «Не удалось загрузить данные»,
 * причём даже после починки пути обычный USER получил бы 403.
 *
 * Эндпоинт лежит вне /api/v1/admin/**, поэтому SecurityConfig
 * ("anyRequest().authenticated()") открывает его всем залогиненным без
 * дополнительных правок конфигурации безопасности.
 */
@RestController
@RequestMapping("/api/v1/prices")
@RequiredArgsConstructor
public class UserPriceController {

    private final IngredientPriceRepository priceRepository;
    private final TripMealRepository tripMealRepository;
    private final RecipeIngredientRepository recipeIngredientRepository;

    /**
     * Все актуальные цены (последний действующий срез на каждый ингредиент).
     * asOf — опциональная дата среза (например, дата начала похода), по умолчанию сегодня.
     */
    @GetMapping
    @Transactional(readOnly = true)
    public List<IngredientPriceResponse> getPrices(@RequestParam(required = false) LocalDate asOf) {
        LocalDate cutoff = asOf != null ? asOf : LocalDate.now();
        // P1 (аудит): было priceRepository.findAll() — вся история цен в памяти.
        // Теперь последний срез на каждый ингредиент считается СУБД (DISTINCT ON),
        // а JOIN FETCH убирает N+1 на ingredient при маппинге.
        return toSortedResponses(priceRepository.findLatestPricesAsOf(cutoff));
    }

    /**
     * Цены, релевантные текущему пользователю: только те ингредиенты, которые
     * входят в рецепты блюд его походов. Ответ имеет тот же формат, что и /prices.
     */
    @GetMapping("/relevant-to-trips")
    @Transactional(readOnly = true)
    public List<IngredientPriceResponse> getPricesRelevantToUserTrips(
            @RequestParam(required = false) LocalDate asOf,
            @AuthenticationPrincipal User user) {
        LocalDate cutoff = asOf != null ? asOf : LocalDate.now();

        // 1. id рецептов всех блюд во всех походах пользователя (JPQL без lazy-обходов)
        Set<Long> recipeIds = new java.util.HashSet<>(
                tripMealRepository.findRecipeIdsByUserId(user.getId()));

        if (recipeIds.isEmpty()) {
            return List.of();
        }

        // 2. ингредиенты этих рецептов
        Set<Long> relevantIngredientIds = recipeIngredientRepository
                .findByRecipeIdIn(new ArrayList<>(recipeIds)).stream()
                .map(ri -> ri.getIngredient().getId())
                .collect(Collectors.toSet());

        if (relevantIngredientIds.isEmpty()) {
            return List.of();
        }

        // 3. последние действующие срезы цен по этим ингредиентам
        //    (P1: фильтрация по set и DISTINCT ON — на стороне БД, не в Java)
        return toSortedResponses(priceRepository.findLatestPricesAsOfForIngredients(
                cutoff, relevantIngredientIds));
    }

    /**
     * P1 (аудит): агрегация «последний срез на ингредиент» перенесена в SQL
     * (findLatestPricesAsOf*), здесь остаётся только маппинг и стабильная сортировка
     * по ingredientId (тот же контракт ответа, что был у latestPerIngredient).
     */
    private static List<IngredientPriceResponse> toSortedResponses(List<IngredientPrice> latest) {
        return latest.stream()
                .map(UserPriceController::toResponse)
                .sorted(Comparator.comparing(IngredientPriceResponse::ingredientId))
                .toList();
    }

    private static IngredientPriceResponse toResponse(IngredientPrice price) {
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

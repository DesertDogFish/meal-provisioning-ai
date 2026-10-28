package com.provision.repository;

import com.provision.entity.IngredientMapping;
import com.provision.entity.RecipeSource;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface IngredientMappingRepository extends JpaRepository<IngredientMapping, Long> {
    Optional<IngredientMapping> findByExternalNameAndSource(String externalName, RecipeSource source);
    Optional<IngredientMapping> findByInternalIngredientIdAndSource(Long internalIngredientId, RecipeSource source);
    List<IngredientMapping> findBySource(RecipeSource source);
    boolean existsByExternalNameAndSource(String externalName, RecipeSource source);

    /** FIX P2 (аудит): JOIN FETCH внутреннего ингредиента против N+1 в getAllMappings. */
    @Query("SELECT DISTINCT m FROM IngredientMapping m JOIN FETCH m.internalIngredient")
    List<IngredientMapping> findAllWithIngredients();

    /** FIX P2 (аудит): то же с фильтром по источнику. */
    @Query("SELECT DISTINCT m FROM IngredientMapping m JOIN FETCH m.internalIngredient WHERE m.source = :source")
    List<IngredientMapping> findBySourceWithIngredients(@Param("source") RecipeSource source);

    /**
     * Fix-16: маппинги источника вместе с ингредиентом И карточкой внешнего продукта
     * для фоновой синхронизации цен.
     *
     * <p>Зачем: фоновый синк ({@code PriceSyncService.runPriceSync}) выполняется БЕЗ
     * БД-сессии (внешний HTTP не должен держать транзакцию, {@code open-in-view: false}),
     * а {@code internalIngredient}/{@code externalProduct} — LAZY. Обычный
     * {@link #findBySource} возвращал detached-прокси, и первое же
     * {@code ingredient.getName()} падало с
     * {@code LazyInitializationException: … no Session} (журнал: «Постатейных данных нет»,
     * синк — FAILED на первом маппинге). JOIN FETCH инициализирует обе ассоциации одним
     * запросом (заодно снимает N+1), а {@code externalCode IS NOT NULL} повторяет прежний
     * фильтр синка в SQL.</p>
     *
     * <p>LEFT JOIN — чтобы маппинг без карточки внешнего продукта не исчезал из выдачи:
     * синк обязан показать его в деталях строкой SKIPPED («Нет карточки внешнего продукта»),
     * а не молча потерять.</p>
     */
    @Query("""
            SELECT m FROM IngredientMapping m
            LEFT JOIN FETCH m.internalIngredient
            LEFT JOIN FETCH m.externalProduct
            WHERE m.source = :source AND m.externalCode IS NOT NULL
            """)
    List<IngredientMapping> findBySourceWithIngredientAndProduct(@Param("source") RecipeSource source);
}

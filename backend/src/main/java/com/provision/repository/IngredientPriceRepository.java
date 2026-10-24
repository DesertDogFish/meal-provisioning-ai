package com.provision.repository;

import com.provision.entity.IngredientPrice;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

@Repository
public interface IngredientPriceRepository extends JpaRepository<IngredientPrice, Long> {
    List<IngredientPrice> findByIngredientIdOrderByEffectiveFromDesc(Long ingredientId);

    /**
     * P1 (аудит): ценовые ряды для набора ингредиентов одним запросом
     * (для корректировки эффективной цены на даты внутри похода в памяти).
     */
    @Query("SELECT ip FROM IngredientPrice ip WHERE ip.ingredient.id IN :ingredientIds ORDER BY ip.ingredient.id, ip.effectiveFrom DESC")
    List<IngredientPrice> findByIngredientIdInOrderByEffectiveFromDesc(
            @Param("ingredientIds") java.util.Collection<Long> ingredientIds);
    
    @Query("SELECT ip FROM IngredientPrice ip WHERE ip.ingredient.id = :ingredientId AND ip.effectiveFrom <= :date ORDER BY ip.effectiveFrom DESC LIMIT 1")
    Optional<IngredientPrice> findEffectivePrice(@Param("ingredientId") Long ingredientId, @Param("date") LocalDate date);
    
    /**
     * P1 (аудит): последний действующий на date срез цены для каждого ингредиента —
     * DISTINCT ON вместо загрузки всей таблицы цен в память (priceRepository.findAll()).
     */
    @Query(value = "SELECT DISTINCT ON (ip.ingredient_id) ip.* " +
                   "FROM ingredient_prices ip " +
                   "WHERE ip.effective_from <= CAST(:date AS DATE) " +
                   "ORDER BY ip.ingredient_id, ip.effective_from DESC",
           nativeQuery = true)
    List<IngredientPrice> findLatestPricesAsOf(@Param("date") LocalDate date);

    /** V20: то же, но только глобальные продукты (справочник цен, GET /prices). */
    @Query(value = "SELECT DISTINCT ON (ip.ingredient_id) ip.* " +
                   "FROM ingredient_prices ip " +
                   "JOIN ingredients i ON i.id = ip.ingredient_id " +
                   "WHERE i.trip_id IS NULL AND ip.effective_from <= CAST(:date AS DATE) " +
                   "ORDER BY ip.ingredient_id, ip.effective_from DESC",
           nativeQuery = true)
    List<IngredientPrice> findLatestGlobalPricesAsOf(@Param("date") LocalDate date);

    /** То же, но только по выбранному набору id ингредиентов (для /prices/relevant-to-trips). */
    @Query(value = "SELECT DISTINCT ON (ip.ingredient_id) ip.* " +
                   "FROM ingredient_prices ip " +
                   "WHERE ip.effective_from <= CAST(:date AS DATE) " +
                   "  AND ip.ingredient_id IN (:ingredientIds) " +
                   "ORDER BY ip.ingredient_id, ip.effective_from DESC",
           nativeQuery = true)
    List<IngredientPrice> findLatestPricesAsOfForIngredients(
            @Param("date") LocalDate date,
            @Param("ingredientIds") java.util.Collection<Long> ingredientIds);

    boolean existsByIngredientIdAndEffectiveFrom(Long ingredientId, LocalDate effectiveFrom);
    
    Optional<IngredientPrice> findByIngredientIdAndEffectiveFrom(Long ingredientId, LocalDate effectiveFrom);
}

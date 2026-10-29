package com.provision.repository;

import com.provision.entity.Ingredient;
import com.provision.entity.UnitOfMeasure;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

@Repository
public interface IngredientRepository extends JpaRepository<Ingredient, Long>, JpaSpecificationExecutor<Ingredient> {
    
    Optional<Ingredient> findByNameNormAndUnit(String nameNorm, UnitOfMeasure unit);
    
    boolean existsByNameNormAndUnit(String nameNorm, UnitOfMeasure unit);
    
    boolean existsByName(String name);
    
    // V20: проверка дублей — только среди глобальных продуктов
    @Query("SELECT i FROM Ingredient i WHERE i.nameNorm = :nameNorm AND i.tripId IS NULL")
    List<Ingredient> findByNameNorm(@Param("nameNorm") String nameNorm);
    
    Optional<Ingredient> findByCode(String code);

    /**
     * V26: глобальные продукты с привязкой к локальной копии ЕМИСС — целевой набор
     * синхронизации цен. Снепшоты походов (trip_id NOT NULL) исключены: история неизменна.
     */
    @Query("SELECT i FROM Ingredient i WHERE i.emisCode IS NOT NULL AND i.tripId IS NULL ORDER BY i.name")
    List<Ingredient> findByEmisCodeIsNotNullAndTripIdIsNull();

    /**
     * KB-8: сколько ГЛОБАЛЬНЫХ продуктов привязано к каждой из позиций ЕМИСС. Нужен значок
     * «позиция уже используется другим продуктом» в таблице продуктов: несколько продуктов на
     * одном коде — законная ситуация (например, «Молоко сухое цельное, кг» у сухого молока
     * и у сухих сливок), но админ должен видеть, что цена придёт одна на всех.
     * Один запрос на страницу списка — без N+1, как и остальные пакетные загрузки.
     *
     * @return пары {@code [emisCode, количество продуктов]}
     */
    @Query("SELECT i.emisCode, COUNT(i) FROM Ingredient i "
            + "WHERE i.tripId IS NULL AND i.emisCode IN :codes GROUP BY i.emisCode")
    List<Object[]> countByEmisCodes(@Param("codes") Collection<String> codes);
    boolean existsByCode(String code);
    
    // FIX (скрытый N+1): category — LAZY @ManyToOne; IngredientService.toDto читает
    // ingredient.getCategory().getName() на каждый элемент списка → по одному
    // «select ... from product_categories where id=?» на ингредиент. Fetch-join
    // решает это одним запросом (категорий мало, раздувание строк незначимо).
    @EntityGraph(attributePaths = {"category"})
    // V20: справочник продуктов — только глобальные
    @Query("SELECT i FROM Ingredient i WHERE i.tripId IS NULL ORDER BY i.name")
    List<Ingredient> findAllOrderByname();
    
    @Query("SELECT COUNT(i) FROM Ingredient i WHERE i.category.id = :categoryId")
    long countByCategoryId(@Param("categoryId") Long categoryId);

    // V20: trip-scoped копии продуктов
    java.util.List<Ingredient> findByTripId(Long tripId);

    java.util.Optional<Ingredient> findByTripIdAndSnapshotOf(Long tripId, Long snapshotOf);
}

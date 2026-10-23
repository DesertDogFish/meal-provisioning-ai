package com.provision.repository;

import com.provision.entity.Ingredient;
import com.provision.entity.UnitOfMeasure;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface IngredientRepository extends JpaRepository<Ingredient, Long>, JpaSpecificationExecutor<Ingredient> {
    
    Optional<Ingredient> findByNameNormAndUnit(String nameNorm, UnitOfMeasure unit);
    
    boolean existsByNameNormAndUnit(String nameNorm, UnitOfMeasure unit);
    
    boolean existsByName(String name);
    
    @Query("SELECT i FROM Ingredient i WHERE i.nameNorm = :nameNorm")
    List<Ingredient> findByNameNorm(@Param("nameNorm") String nameNorm);
    
    Optional<Ingredient> findByCode(String code);
    boolean existsByCode(String code);
    
    // FIX (скрытый N+1): category — LAZY @ManyToOne; IngredientService.toDto читает
    // ingredient.getCategory().getName() на каждый элемент списка → по одному
    // «select ... from product_categories where id=?» на ингредиент. Fetch-join
    // решает это одним запросом (категорий мало, раздувание строк незначимо).
    @EntityGraph(attributePaths = {"category"})
    @Query("SELECT i FROM Ingredient i ORDER BY i.name")
    List<Ingredient> findAllOrderByname();
    
    @Query("SELECT COUNT(i) FROM Ingredient i WHERE i.category.id = :categoryId")
    long countByCategoryId(@Param("categoryId") Long categoryId);
}

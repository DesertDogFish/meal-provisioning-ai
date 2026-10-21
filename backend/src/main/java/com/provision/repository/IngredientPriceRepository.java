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
    
    @Query("SELECT ip FROM IngredientPrice ip WHERE ip.ingredient.id = :ingredientId AND ip.effectiveFrom <= :date ORDER BY ip.effectiveFrom DESC LIMIT 1")
    Optional<IngredientPrice> findEffectivePrice(@Param("ingredientId") Long ingredientId, @Param("date") LocalDate date);
    
    boolean existsByIngredientIdAndEffectiveFrom(Long ingredientId, LocalDate effectiveFrom);
    
    Optional<IngredientPrice> findByIngredientIdAndEffectiveFrom(Long ingredientId, LocalDate effectiveFrom);
}

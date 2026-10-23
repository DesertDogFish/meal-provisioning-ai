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
}

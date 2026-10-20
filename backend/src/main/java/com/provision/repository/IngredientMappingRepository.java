package com.provision.repository;

import com.provision.entity.IngredientMapping;
import com.provision.entity.RecipeSource;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface IngredientMappingRepository extends JpaRepository<IngredientMapping, Long> {
    Optional<IngredientMapping> findByExternalNameAndSource(String externalName, RecipeSource source);
    Optional<IngredientMapping> findByInternalIngredientIdAndSource(Long internalIngredientId, RecipeSource source);
    List<IngredientMapping> findBySource(RecipeSource source);
    boolean existsByExternalNameAndSource(String externalName, RecipeSource source);
}

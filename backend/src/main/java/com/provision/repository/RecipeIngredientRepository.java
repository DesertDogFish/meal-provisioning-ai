package com.provision.repository;

import com.provision.entity.RecipeIngredient;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface RecipeIngredientRepository extends JpaRepository<RecipeIngredient, Long> {
    List<RecipeIngredient> findByRecipeId(Long recipeId);
    
    @Query("SELECT ri FROM RecipeIngredient ri JOIN FETCH ri.ingredient WHERE ri.recipe.id = :recipeId")
    List<RecipeIngredient> findByRecipeIdWithIngredient(@Param("recipeId") Long recipeId);

    /** P0-3: ингредиенты нескольких рецептов одним запросом (для /api/v1/prices/relevant-to-trips). */
    @Query("SELECT ri FROM RecipeIngredient ri JOIN FETCH ri.ingredient WHERE ri.recipe.id IN :recipeIds")
    List<RecipeIngredient> findByRecipeIdIn(@Param("recipeIds") java.util.Collection<Long> recipeIds);
    
    @Query("SELECT ri.recipe.id FROM RecipeIngredient ri WHERE ri.ingredient.id = :ingredientId")
    List<Long> findRecipeIdsByIngredientId(@Param("ingredientId") Long ingredientId);
    
    boolean existsByRecipeIdAndIngredientId(Long recipeId, Long ingredientId);
}

package com.provision.repository;

import com.provision.entity.MealType;
import com.provision.entity.Recipe;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface RecipeRepository extends JpaRepository<Recipe, Long> {
    List<Recipe> findByMealType(MealType mealType);
    
    @Query("SELECT r FROM Recipe r ORDER BY r.name")
    List<Recipe> findAllOrderByName();
    
    @Query("SELECT r FROM Recipe r LEFT JOIN FETCH r.ingredients ri LEFT JOIN FETCH ri.ingredient WHERE r.id = :id")
    Recipe findByIdWithIngredients(@Param("id") Long id);
    
    @Query("SELECT r FROM Recipe r LEFT JOIN FETCH r.ingredients ri LEFT JOIN FETCH ri.ingredient ORDER BY r.name")
    List<Recipe> findAllWithIngredients();
}

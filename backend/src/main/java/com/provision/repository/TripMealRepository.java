package com.provision.repository;

import com.provision.entity.TripMeal;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface TripMealRepository extends JpaRepository<TripMeal, Long> {
    @Query("SELECT tm FROM TripMeal tm WHERE tm.tripDay.id = :tripDayId ORDER BY tm.sortOrder")
    List<TripMeal> findByTripDayIdOrderBySortOrder(@Param("tripDayId") Long tripDayId);
    
    @Query("SELECT CASE WHEN COUNT(tm) > 0 THEN true ELSE false END FROM TripMeal tm WHERE tm.recipe.id = :recipeId")
    boolean existsByRecipeId(@Param("recipeId") Long recipeId);
    
    @Query("SELECT tm FROM TripMeal tm JOIN FETCH tm.tripDay td JOIN FETCH td.trip WHERE tm.recipe.id = :recipeId")
    List<TripMeal> findAllByRecipeIdWithTrip(@Param("recipeId") Long recipeId);
}

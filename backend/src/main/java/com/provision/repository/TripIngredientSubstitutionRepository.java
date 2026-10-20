package com.provision.repository;

import com.provision.entity.TripIngredientSubstitution;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface TripIngredientSubstitutionRepository extends JpaRepository<TripIngredientSubstitution, Long> {
    
    List<TripIngredientSubstitution> findByTripId(Long tripId);
    
    List<TripIngredientSubstitution> findByTripIdAndRecipeId(Long tripId, Long recipeId);
    
    Optional<TripIngredientSubstitution> findByTripIdAndRecipeIdAndFromIngredientId(
        Long tripId, Long recipeId, Long fromIngredientId);
    
    @Query("SELECT s FROM TripIngredientSubstitution s " +
           "JOIN FETCH s.fromIngredient " +
           "JOIN FETCH s.toIngredient " +
           "WHERE s.trip.id = :tripId")
    List<TripIngredientSubstitution> findByTripIdWithIngredients(@Param("tripId") Long tripId);
    
    void deleteByTripIdAndRecipeIdAndFromIngredientId(Long tripId, Long recipeId, Long fromIngredientId);
}

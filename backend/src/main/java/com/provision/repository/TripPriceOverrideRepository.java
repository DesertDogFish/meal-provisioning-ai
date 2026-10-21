package com.provision.repository;

import com.provision.entity.TripPriceOverride;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface TripPriceOverrideRepository extends JpaRepository<TripPriceOverride, Long> {
    List<TripPriceOverride> findByTripId(Long tripId);
    Optional<TripPriceOverride> findByTripIdAndIngredientId(Long tripId, Long ingredientId);
    void deleteByTripIdAndIngredientId(Long tripId, Long ingredientId);
}

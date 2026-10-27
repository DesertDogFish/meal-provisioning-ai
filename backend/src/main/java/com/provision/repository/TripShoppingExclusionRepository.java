package com.provision.repository;

import com.provision.entity.TripShoppingExclusion;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface TripShoppingExclusionRepository extends JpaRepository<TripShoppingExclusion, Long> {

    @Query("SELECT e FROM TripShoppingExclusion e JOIN FETCH e.ingredient WHERE e.trip.id = :tripId")
    List<TripShoppingExclusion> findByTripId(@Param("tripId") Long tripId);

    /**
     * Fix-5 / R2 (шаг 2): с по-дневной областью у пары (trip, ingredient) может быть
     * НЕСКОЛЬКО строк (глобальная + дневные) — поэтому List, а не Optional
     * (иначе IncorrectResultSizeDataAccessException).
     */
    List<TripShoppingExclusion> findByTripIdAndIngredientId(Long tripId, Long ingredientId);

    Optional<TripShoppingExclusion> findByTripIdAndIngredientIdAndDayDateIsNull(Long tripId, Long ingredientId);

    void deleteByTripIdAndIngredientId(Long tripId, Long ingredientId);

    @Modifying
    @Query("DELETE FROM TripShoppingExclusion e WHERE e.trip.id = :tripId")
    void deleteAllByTripId(@Param("tripId") Long tripId);
}

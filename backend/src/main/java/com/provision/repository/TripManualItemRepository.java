package com.provision.repository;

import com.provision.entity.TripManualItem;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface TripManualItemRepository extends JpaRepository<TripManualItem, Long> {

    /** Позиции похода с захватом дня и продукта (без N+1 на список). */
    @Query("SELECT i FROM TripManualItem i " +
            "LEFT JOIN FETCH i.day " +
            "JOIN FETCH i.ingredient " +
            "WHERE i.trip.id = :tripId ORDER BY i.id ASC")
    List<TripManualItem> findByTripIdWithRefs(@Param("tripId") Long tripId);

    /** R3 (Fix-3): usedIn-проверка удаления продукта — ручные позиции, ссылающиеся на него. */
    @Query("SELECT i FROM TripManualItem i JOIN FETCH i.trip WHERE i.ingredient.id = :ingredientId")
    List<TripManualItem> findByIngredientId(@Param("ingredientId") Long ingredientId);
}

package com.provision.repository;

import com.provision.entity.TripChecklistActualQty;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface TripChecklistActualQtyRepository extends JpaRepository<TripChecklistActualQty, Long> {

    @Query("SELECT q FROM TripChecklistActualQty q JOIN FETCH q.ingredient WHERE q.trip.id = :tripId ORDER BY q.id")
    List<TripChecklistActualQty> findByTripId(@Param("tripId") Long tripId);

    /** flushAutomatically: bulk-DELETE уходит в БД до saveAll, иначе повторная
     * вставка той же пары (trip_id, ingredient_id) конфликтует с уникальным индексом. */
    @Modifying(flushAutomatically = true)
    @Query("DELETE FROM TripChecklistActualQty q WHERE q.trip.id = :tripId")
    void deleteAllByTripId(@Param("tripId") Long tripId);
}

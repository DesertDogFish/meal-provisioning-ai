package com.provision.repository;

import com.provision.entity.TripChecklistBought;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface TripChecklistBoughtRepository extends JpaRepository<TripChecklistBought, Long> {

    @Query("SELECT b FROM TripChecklistBought b JOIN FETCH b.ingredient WHERE b.trip.id = :tripId ORDER BY b.id")
    List<TripChecklistBought> findByTripId(@Param("tripId") Long tripId);

    /** flushAutomatically: bulk-DELETE гарантированно уходит в БД до saveAll,
     * иначе при повторной вставке того же набора возможен конфликт с
     * uq_tcb_trip_ingredient_stamp (KB-15, сценарий повторного PUT). */
    @Modifying(flushAutomatically = true)
    @Query("DELETE FROM TripChecklistBought b WHERE b.trip.id = :tripId")
    void deleteAllByTripId(@Param("tripId") Long tripId);
}

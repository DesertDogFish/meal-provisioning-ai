package com.provision.repository;

import com.provision.entity.TripDay;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

@Repository
public interface TripDayRepository extends JpaRepository<TripDay, Long> {
    @Query("SELECT td FROM TripDay td WHERE td.trip.id = :tripId ORDER BY td.dayDate")
    List<TripDay> findByTripIdOrderByDayDate(@Param("tripId") Long tripId);
    
    @Query("SELECT td FROM TripDay td LEFT JOIN FETCH td.meals WHERE td.trip.id = :tripId ORDER BY td.dayDate")
    List<TripDay> findByTripIdWithMeals(@Param("tripId") Long tripId);
    
    Optional<TripDay> findByTripIdAndDayDate(Long tripId, LocalDate dayDate);
}

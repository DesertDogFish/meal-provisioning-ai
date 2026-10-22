package com.provision.repository;

import com.provision.entity.Trip;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface TripRepository extends JpaRepository<Trip, Long> {
    @Query("SELECT t FROM Trip t WHERE t.user.id = :userId ORDER BY t.startDate DESC")
    List<Trip> findByUserId(@Param("userId") Long userId);
    
    @Query("SELECT t FROM Trip t LEFT JOIN FETCH t.days WHERE t.id = :id AND t.user.id = :userId")
    java.util.Optional<Trip> findByIdAndUserId(@Param("id") Long id, @Param("userId") Long userId);
    
    @Query("SELECT t FROM Trip t LEFT JOIN FETCH t.days td LEFT JOIN FETCH td.meals tm LEFT JOIN FETCH tm.recipe WHERE t.id = :id AND t.user.id = :userId")
    java.util.Optional<Trip> findByIdWithDaysAndMeals(@Param("id") Long id, @Param("userId") Long userId);
}

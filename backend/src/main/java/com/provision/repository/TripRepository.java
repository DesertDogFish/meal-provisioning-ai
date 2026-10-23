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

    // P1 (аудит ФАЗЫ 11, Шаг 4): устранение N+1 в getUserTrips.
    // Два batch-запроса вместо fetch-join'ов: (1) все дни для списка походов,
    // (2) все блюда/рецепты для этих дней. Избегаем декартова раздувания
    // и сохраняем порядок startDate DESC в основном запросе.
    @Query("SELECT d FROM TripDay d WHERE d.trip.id IN :tripIds")
    List<com.provision.entity.TripDay> findDaysByTripIds(@Param("tripIds") List<Long> tripIds);

    @Query("SELECT m FROM TripMeal m JOIN FETCH m.recipe WHERE m.tripDay.id IN :dayIds")
    List<com.provision.entity.TripMeal> findMealsWithRecipesByDayIds(@Param("dayIds") List<Long> dayIds);

    @Query("SELECT t FROM Trip t LEFT JOIN FETCH t.days WHERE t.id = :id AND t.user.id = :userId")
    java.util.Optional<Trip> findByIdAndUserId(@Param("id") Long id, @Param("userId") Long userId);
    
    @Query("SELECT t FROM Trip t LEFT JOIN FETCH t.days td LEFT JOIN FETCH td.meals tm LEFT JOIN FETCH tm.recipe WHERE t.id = :id AND t.user.id = :userId")
    java.util.Optional<Trip> findByIdWithDaysAndMeals(@Param("id") Long id, @Param("userId") Long userId);
}

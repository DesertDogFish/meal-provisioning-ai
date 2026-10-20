package com.provision.service;

import com.provision.dto.trip.*;
import com.provision.entity.*;
import com.provision.exception.ForbiddenException;
import com.provision.exception.NotFoundException;
import com.provision.repository.*;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;

@Service
@RequiredArgsConstructor
@Slf4j
public class TripService {

    private final TripRepository tripRepository;
    private final TripDayRepository tripDayRepository;
    private final TripMealRepository tripMealRepository;
    private final UserRepository userRepository;
    private final RecipeRepository recipeRepository;

    @Transactional(readOnly = true)
    public List<TripResponse> getUserTrips(Long userId) {
        return tripRepository.findByUserId(userId).stream()
                .map(this::toResponse)
                .toList();
    }

    @Transactional(readOnly = true)
    public TripResponse getTrip(Long tripId, Long userId) {
        Trip trip = tripRepository.findByIdWithDaysAndMeals(tripId, userId);
        if (trip == null) {
            throw new NotFoundException("Trip not found or access denied");
        }
        return toResponse(trip);
    }

    @Transactional
    public TripResponse createTrip(TripRequest request, Long userId) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new NotFoundException("User not found"));

        Trip trip = Trip.builder()
                .user(user)
                .name(request.name())
                .startDate(request.startDate())
                .endDate(request.endDate())
                .defaultPeople(request.defaultPeople())
                .notes(request.notes())
                .days(new ArrayList<>())
                .build();

        trip = tripRepository.save(trip);

        // Автоматически создаём дни
        LocalDate currentDate = request.startDate();
        while (!currentDate.isAfter(request.endDate())) {
            TripDay day = TripDay.builder()
                    .trip(trip)
                    .dayDate(currentDate)
                    .meals(new ArrayList<>())
                    .build();
            trip.getDays().add(day);
            currentDate = currentDate.plusDays(1);
        }

        trip = tripRepository.save(trip);
        log.info("Created trip: {} for user: {}", trip.getName(), user.getEmail());
        return toResponse(trip);
    }

    @Transactional
    public TripResponse updateTrip(Long tripId, TripRequest request, Long userId) {
        Trip trip = tripRepository.findByIdWithDaysAndMeals(tripId, userId);
        if (trip == null) {
            throw new NotFoundException("Trip not found or access denied");
        }

        // Нельзя менять даты
        if (!trip.getStartDate().equals(request.startDate()) || !trip.getEndDate().equals(request.endDate())) {
            throw new IllegalArgumentException("Cannot change trip dates. Create a new trip instead.");
        }

        trip.setName(request.name());
        trip.setDefaultPeople(request.defaultPeople());
        trip.setNotes(request.notes());

        trip = tripRepository.save(trip);
        log.info("Updated trip: {}", trip.getName());
        return toResponse(trip);
    }

    @Transactional
    public void deleteTrip(Long tripId, Long userId) {
        Trip trip = tripRepository.findByIdWithDaysAndMeals(tripId, userId);
        if (trip == null) {
            throw new NotFoundException("Trip not found or access denied");
        }

        tripRepository.deleteById(tripId);
        log.info("Deleted trip: {}", trip.getName());
    }

    @Transactional
    public TripDayResponse updateDay(Long tripId, Long dayId, TripDayUpdateRequest request, Long userId) {
        Trip trip = tripRepository.findByIdWithDaysAndMeals(tripId, userId);
        if (trip == null) {
            throw new NotFoundException("Trip not found or access denied");
        }

        TripDay day = trip.getDays().stream()
                .filter(d -> d.getId().equals(dayId))
                .findFirst()
                .orElseThrow(() -> new NotFoundException("Day not found"));

        day.setPeopleOverride(request.peopleOverride());
        tripDayRepository.save(day);

        return toDayResponse(day);
    }

    @Transactional
    public TripMealResponse addMeal(Long tripId, Long dayId, TripMealRequest request, Long userId) {
        Trip trip = tripRepository.findByIdWithDaysAndMeals(tripId, userId);
        if (trip == null) {
            throw new NotFoundException("Trip not found or access denied");
        }

        TripDay day = trip.getDays().stream()
                .filter(d -> d.getId().equals(dayId))
                .findFirst()
                .orElseThrow(() -> new NotFoundException("Day not found"));

        Recipe recipe = recipeRepository.findById(request.recipeId())
                .orElseThrow(() -> new NotFoundException("Recipe not found"));

        TripMeal meal = TripMeal.builder()
                .tripDay(day)
                .mealType(request.mealType())
                .recipe(recipe)
                .peopleOverride(request.peopleOverride())
                .sortOrder(request.sortOrder())
                .build();

        meal = tripMealRepository.save(meal);
        log.info("Added meal to trip: {}", trip.getName());
        return toMealResponse(meal);
    }

    @Transactional
    public TripMealResponse updateMeal(Long tripId, Long dayId, Long mealId, TripMealRequest request, Long userId) {
        Trip trip = tripRepository.findByIdWithDaysAndMeals(tripId, userId);
        if (trip == null) {
            throw new NotFoundException("Trip not found or access denied");
        }

        TripMeal meal = tripMealRepository.findById(mealId)
                .orElseThrow(() -> new NotFoundException("Meal not found"));

        Recipe recipe = recipeRepository.findById(request.recipeId())
                .orElseThrow(() -> new NotFoundException("Recipe not found"));

        meal.setMealType(request.mealType());
        meal.setRecipe(recipe);
        meal.setPeopleOverride(request.peopleOverride());
        meal.setSortOrder(request.sortOrder());

        meal = tripMealRepository.save(meal);
        return toMealResponse(meal);
    }

    @Transactional
    public void deleteMeal(Long tripId, Long dayId, Long mealId, Long userId) {
        Trip trip = tripRepository.findByIdWithDaysAndMeals(tripId, userId);
        if (trip == null) {
            throw new NotFoundException("Trip not found or access denied");
        }

        tripMealRepository.deleteById(mealId);
    }

    private TripResponse toResponse(Trip trip) {
        List<TripDayResponse> days = trip.getDays().stream()
                .map(this::toDayResponse)
                .toList();

        return new TripResponse(
                trip.getId(),
                trip.getName(),
                trip.getStartDate(),
                trip.getEndDate(),
                trip.getDefaultPeople(),
                trip.getNotes(),
                trip.getCreatedAt(),
                days
        );
    }

    private TripDayResponse toDayResponse(TripDay day) {
        List<TripMealResponse> meals = day.getMeals().stream()
                .map(this::toMealResponse)
                .toList();

        return new TripDayResponse(
                day.getId(),
                day.getDayDate(),
                day.getPeopleOverride(),
                meals
        );
    }

    private TripMealResponse toMealResponse(TripMeal meal) {
        return new TripMealResponse(
                meal.getId(),
                meal.getMealType(),
                meal.getRecipe().getId(),
                meal.getRecipe().getName(),
                meal.getPeopleOverride(),
                meal.getSortOrder()
        );
    }
}

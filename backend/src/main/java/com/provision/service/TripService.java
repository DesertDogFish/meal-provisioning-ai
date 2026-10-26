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
    private final TripCatalogSnapshotService snapshotService;

    @Transactional(readOnly = true)
    public List<TripResponse> getUserTrips(Long userId) {
        List<Trip> trips = tripRepository.findByUserId(userId);
        if (trips.isEmpty()) {
            return List.of();
        }

        // P1 (аудит ФАЗЫ 11, Шаг 4): было N+1 — lazy days/meals/recipe грузились
        // по одному запросу на каждый поход/день. Теперь: ровно 2 batch-запроса,
        // после чего коллекции уже в persistence context и toResponse не триггерит ленивую загрузку.
        List<Long> tripIds = trips.stream().map(Trip::getId).toList();
        List<TripDay> days = tripRepository.findDaysByTripIds(tripIds);

        if (!days.isEmpty()) {
            List<Long> dayIds = days.stream().map(TripDay::getId).toList();
            tripRepository.findMealsWithRecipesByDayIds(dayIds);
        }

        return trips.stream()
                .map(this::toResponse)
                .toList();
    }

    @Transactional(readOnly = true)
    public TripResponse getTrip(Long tripId, Long userId) {
        Trip trip = tripRepository.findByIdWithDaysAndMeals(tripId, userId)
                .orElseThrow(() -> new NotFoundException("Trip not found or access denied"));
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
                .days(new java.util.LinkedHashSet<>())
                .build();

        trip = tripRepository.save(trip);

        // Автоматически создаём дни
        LocalDate currentDate = request.startDate();
        while (!currentDate.isAfter(request.endDate())) {
            TripDay day = TripDay.builder()
                    .trip(trip)
                    .dayDate(currentDate)
                    .meals(new java.util.LinkedHashSet<>())
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
        Trip trip = tripRepository.findByIdWithDaysAndMeals(tripId, userId)
                .orElseThrow(() -> new NotFoundException("Trip not found or access denied"));

        LocalDate newStart = request.startDate();
        LocalDate newEnd = request.endDate();
        if (newEnd.isBefore(newStart)) {
            throw new IllegalArgumentException("endDate must not be before startDate");
        }

        trip.setName(request.name());
        trip.setDefaultPeople(request.defaultPeople());
        trip.setNotes(request.notes());

        // Fix-2 (список 26.10, п.1): смена дат разрешена. Стирание — ЧАСТИЧНОЕ:
        // удаляются только дни, ушедшие за новые границы (вместе с приёмами —
        // orphanRemoval, и ручными позициями дня — FK ON DELETE CASCADE, V22).
        // Пересекающиеся дни сохраняют план полностью; недостающие даты добавляются.
        // Ранее: throw new IllegalArgumentException("Cannot change trip dates...").
        boolean datesChanged = !trip.getStartDate().equals(newStart) || !trip.getEndDate().equals(newEnd);
        if (datesChanged) {
            trip.getDays().removeIf(d -> d.getDayDate().isBefore(newStart) || d.getDayDate().isAfter(newEnd));

            java.util.Set<LocalDate> existingDates = new java.util.HashSet<>();
            for (TripDay d : trip.getDays()) {
                existingDates.add(d.getDayDate());
            }
            LocalDate cursor = newStart;
            while (!cursor.isAfter(newEnd)) {
                if (!existingDates.contains(cursor)) {
                    TripDay day = TripDay.builder()
                            .trip(trip)
                            .dayDate(cursor)
                            .meals(new java.util.LinkedHashSet<>())
                            .build();
                    trip.getDays().add(day);
                }
                cursor = cursor.plusDays(1);
            }
            trip.setStartDate(newStart);
            trip.setEndDate(newEnd);
        }

        trip = tripRepository.save(trip);
        log.info("Updated trip: {} (datesChanged={})", trip.getName(), datesChanged);
        return toResponse(trip);
    }

    @Transactional
    public void deleteTrip(Long tripId, Long userId) {
        Trip trip = tripRepository.findByIdWithDaysAndMeals(tripId, userId)
                .orElseThrow(() -> new NotFoundException("Trip not found or access denied"));

        tripRepository.deleteById(tripId);
        log.info("Deleted trip: {}", trip.getName());
    }

    @Transactional
    public TripDayResponse updateDay(Long tripId, Long dayId, TripDayUpdateRequest request, Long userId) {
        Trip trip = tripRepository.findByIdWithDaysAndMeals(tripId, userId)
                .orElseThrow(() -> new NotFoundException("Trip not found or access denied"));

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
        Trip trip = tripRepository.findByIdWithDaysAndMeals(tripId, userId)
                .orElseThrow(() -> new NotFoundException("Trip not found or access denied"));

        TripDay day = trip.getDays().stream()
                .filter(d -> d.getId().equals(dayId))
                .findFirst()
                .orElseThrow(() -> new NotFoundException("Day not found"));

        Recipe recipe = recipeRepository.findById(request.recipeId())
                .orElseThrow(() -> new NotFoundException("Recipe not found"));

        // Trip-scoped рецепт ЧУЖОГО похода для этого похода не существует (привязка V20).
        if (recipe.getTripId() != null && !recipe.getTripId().equals(tripId)) {
            throw new NotFoundException("Recipe not found");
        }

        // V20: поход работает со снепшотом блюда, а не с глобальным справочником —
        // правки/удаления каталога и цен больше не затрагивают спланированный поход.
        recipe = snapshotService.snapshotRecipeForTrip(trip, recipe);

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
        // IDOR-защита: блюдо ищем только внутри загруженного похода текущего пользователя,
        // а не через трип-агностичный tripMealRepository.findById(mealId).
        Trip trip = tripRepository.findByIdWithDaysAndMeals(tripId, userId)
                .orElseThrow(() -> new NotFoundException("Trip not found or access denied"));

        TripMeal meal = findOwnedMeal(trip, dayId, mealId);

        Recipe recipe = recipeRepository.findById(request.recipeId())
                .orElseThrow(() -> new NotFoundException("Recipe not found"));

        // Trip-scoped рецепт ЧУЖОГО похода для этого похода не существует (привязка V20).
        if (recipe.getTripId() != null && !recipe.getTripId().equals(tripId)) {
            throw new NotFoundException("Recipe not found");
        }

        // V20: как и addMeal — приём всегда указывает на trip-снепшот рецепта.
        // Без этого редактирование приёма (смена people/блюда из пикера) возвращало
        // meal на ГЛОБАЛЬНЫЙ каталог: изоляция похода ломалась, а правки состава
        // (привязаны к снепшот-рецепту) молча переставали применяться.
        recipe = snapshotService.snapshotRecipeForTrip(trip, recipe);

        meal.setMealType(request.mealType());
        meal.setRecipe(recipe);
        meal.setPeopleOverride(request.peopleOverride());
        meal.setSortOrder(request.sortOrder());

        meal = tripMealRepository.save(meal);
        return toMealResponse(meal);
    }

    @Transactional
    public void deleteMeal(Long tripId, Long dayId, Long mealId, Long userId) {
        // IDOR-защита: удаляем блюдо из коллекции дня (orphanRemoval=true),
        // а не через tripMealRepository.deleteById(mealId) без проверки принадлежности.
        Trip trip = tripRepository.findByIdWithDaysAndMeals(tripId, userId)
                .orElseThrow(() -> new NotFoundException("Trip not found or access denied"));

        TripMeal meal = findOwnedMeal(trip, dayId, mealId);
        TripDay day = meal.getTripDay();
        day.getMeals().remove(meal);
        tripRepository.save(trip);
        log.info("Deleted meal {} from day {} of trip {}", mealId, dayId, tripId);
    }

    /**
     * Возвращает блюдо, гарантируя, что оно принадлежит дню dayId внутри данного trip
     * (принадлежность trips уже проверена запросом findByIdWithDaysAndMeals с фильтром по userId).
     */
    private TripMeal findOwnedMeal(Trip trip, Long dayId, Long mealId) {
        return trip.getDays().stream()
                .filter(d -> d.getId().equals(dayId))
                .findFirst()
                .orElseThrow(() -> new NotFoundException("Day not found in this trip"))
                .getMeals().stream()
                .filter(m -> m.getId().equals(mealId))
                .findFirst()
                .orElseThrow(() -> new NotFoundException("Meal not found in this day/trip"));
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

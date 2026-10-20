package com.provision.controller;

import com.provision.dto.trip.*;
import com.provision.entity.User;
import com.provision.service.TripService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/v1/trips")
@RequiredArgsConstructor
public class TripController {

    private final TripService tripService;

    @GetMapping
    public List<TripResponse> getUserTrips(@AuthenticationPrincipal User user) {
        return tripService.getUserTrips(user.getId());
    }

    @GetMapping("/{id}")
    public TripResponse getTrip(@PathVariable Long id, @AuthenticationPrincipal User user) {
        return tripService.getTrip(id, user.getId());
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public TripResponse createTrip(
            @Valid @RequestBody TripRequest request,
            @AuthenticationPrincipal User user
    ) {
        return tripService.createTrip(request, user.getId());
    }

    @PutMapping("/{id}")
    public TripResponse updateTrip(
            @PathVariable Long id,
            @Valid @RequestBody TripRequest request,
            @AuthenticationPrincipal User user
    ) {
        return tripService.updateTrip(id, request, user.getId());
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteTrip(@PathVariable Long id, @AuthenticationPrincipal User user) {
        tripService.deleteTrip(id, user.getId());
    }

    @PutMapping("/{tripId}/days/{dayId}")
    public TripDayResponse updateDay(
            @PathVariable Long tripId,
            @PathVariable Long dayId,
            @Valid @RequestBody TripDayUpdateRequest request,
            @AuthenticationPrincipal User user
    ) {
        return tripService.updateDay(tripId, dayId, request, user.getId());
    }

    @PostMapping("/{tripId}/days/{dayId}/meals")
    @ResponseStatus(HttpStatus.CREATED)
    public TripMealResponse addMeal(
            @PathVariable Long tripId,
            @PathVariable Long dayId,
            @Valid @RequestBody TripMealRequest request,
            @AuthenticationPrincipal User user
    ) {
        return tripService.addMeal(tripId, dayId, request, user.getId());
    }

    @PutMapping("/{tripId}/days/{dayId}/meals/{mealId}")
    public TripMealResponse updateMeal(
            @PathVariable Long tripId,
            @PathVariable Long dayId,
            @PathVariable Long mealId,
            @Valid @RequestBody TripMealRequest request,
            @AuthenticationPrincipal User user
    ) {
        return tripService.updateMeal(tripId, dayId, mealId, request, user.getId());
    }

    @DeleteMapping("/{tripId}/days/{dayId}/meals/{mealId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteMeal(
            @PathVariable Long tripId,
            @PathVariable Long dayId,
            @PathVariable Long mealId,
            @AuthenticationPrincipal User user
    ) {
        tripService.deleteMeal(tripId, dayId, mealId, user.getId());
    }
}

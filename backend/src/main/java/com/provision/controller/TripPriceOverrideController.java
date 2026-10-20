package com.provision.controller;

import com.provision.dto.trip.TripPriceOverrideRequest;
import com.provision.dto.trip.TripPriceOverrideResponse;
import com.provision.entity.User;
import com.provision.service.TripPriceOverrideService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/v1/trips/{tripId}/price-overrides")
@RequiredArgsConstructor
public class TripPriceOverrideController {

    private final TripPriceOverrideService overrideService;

    @GetMapping
    public List<TripPriceOverrideResponse> getOverrides(
            @PathVariable Long tripId,
            @AuthenticationPrincipal User user
    ) {
        return overrideService.getOverrides(tripId, user.getId());
    }

    @PutMapping("/{ingredientId}")
    public TripPriceOverrideResponse createOrUpdateOverride(
            @PathVariable Long tripId,
            @PathVariable Long ingredientId,
            @Valid @RequestBody TripPriceOverrideRequest request,
            @AuthenticationPrincipal User user
    ) {
        return overrideService.createOrUpdateOverride(tripId, ingredientId, request, user.getId());
    }

    @DeleteMapping("/{ingredientId}")
    public ResponseEntity<Void> deleteOverride(
            @PathVariable Long tripId,
            @PathVariable Long ingredientId,
            @AuthenticationPrincipal User user
    ) {
        overrideService.deleteOverride(tripId, ingredientId, user.getId());
        return ResponseEntity.noContent().build();
    }
}

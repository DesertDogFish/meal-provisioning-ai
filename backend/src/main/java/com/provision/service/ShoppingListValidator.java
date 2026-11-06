package com.provision.service;

import com.provision.entity.Trip;
import java.util.Objects;

final class ShoppingListValidator {
    private ShoppingListValidator() {}

    public static void validate(Trip trip, TripCalculationContext ctx, Long tripId) {
        Objects.requireNonNull(trip);
        Objects.requireNonNull(ctx);
        Objects.requireNonNull(tripId);
    }
}
package com.provision.dto.trip;

import java.time.LocalDate;
import java.util.List;

public record TripDayResponse(
    Long id,
    LocalDate dayDate,
    Integer peopleOverride,
    List<TripMealResponse> meals
) {}

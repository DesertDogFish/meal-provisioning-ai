package com.provision.dto.trip;

import jakarta.validation.constraints.Min;

public record TripDayUpdateRequest(
    @Min(1)
    Integer peopleOverride
) {}

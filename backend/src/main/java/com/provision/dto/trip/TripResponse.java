package com.provision.dto.trip;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

public record TripResponse(
    Long id,
    String name,
    LocalDate startDate,
    LocalDate endDate,
    Integer defaultPeople,
    String notes,
    LocalDateTime createdAt,
    List<TripDayResponse> days
) {}

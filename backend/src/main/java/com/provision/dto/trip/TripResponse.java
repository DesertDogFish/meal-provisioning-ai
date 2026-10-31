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
    List<TripDayResponse> days,
    /**
     * План cleanup-п.8 (вариант A): прогресс карточки — заполняется ТОЛЬКО в
     * списке GET /trips (TripProgressService); в одиночных ответах — null.
     */
    TripProgressResponse progress
) {}

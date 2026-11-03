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
    /**
     * trip-workflow-redesign п.2: меню этапа ① утверждено владельцем похода.
     * Контракт mock↔real (п.3): поле присутствует во всех ответах TripResponse.
     */
    Boolean menuApproved,
    LocalDateTime createdAt,
    List<TripDayResponse> days,
    /**
     * План cleanup-п.8 (вариант A): прогресс карточки — заполняется ТОЛЬКО в
     * списке GET /trips (TripProgressService); в одиночных ответах — null.
     */
    TripProgressResponse progress
) {}

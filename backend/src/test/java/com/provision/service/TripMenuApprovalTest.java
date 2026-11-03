package com.provision.service;

import com.provision.dto.trip.TripResponse;
import com.provision.entity.Trip;
import com.provision.exception.NotFoundException;
import com.provision.repository.RecipeRepository;
import com.provision.repository.TripDayRepository;
import com.provision.repository.TripMealRepository;
import com.provision.repository.TripRepository;
import com.provision.repository.UserRepository;
import org.junit.jupiter.api.Test;

import java.time.LocalDate;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * trip-workflow-redesign п.2: unit-семантика toggle утверждения меню ①:
 * null → утверждено → снято; чужой поход — NotFoundException (404), как прочие
 * мутации похода. HTTP-контракт и 409 — TripMenuApprovalIntegrationTest.
 */
class TripMenuApprovalTest {

    private final TripRepository tripRepository = mock(TripRepository.class);
    private final TripService service = new TripService(
            tripRepository,
            mock(TripDayRepository.class),
            mock(TripMealRepository.class),
            mock(UserRepository.class),
            mock(RecipeRepository.class),
            mock(TripCatalogSnapshotService.class),
            mock(TripProgressService.class));

    private Trip trip() {
        Trip t = new Trip();
        t.setId(1L);
        t.setName("T");
        t.setStartDate(LocalDate.parse("2026-06-01"));
        t.setEndDate(LocalDate.parse("2026-06-02"));
        t.setDefaultPeople(2);
        return t;
    }

    @Test
    void toggleApprovesThenRevokes() {
        Trip t = trip();
        when(tripRepository.findByIdWithDaysAndMeals(1L, 7L)).thenReturn(Optional.of(t));
        when(tripRepository.save(any(Trip.class))).thenAnswer(i -> i.getArgument(0));

        TripResponse first = service.toggleMenuApproval(1L, 7L);
        assertThat(first.menuApproved()).isTrue();
        assertThat(t.getMenuApprovedAt()).isNotNull();

        TripResponse second = service.toggleMenuApproval(1L, 7L);
        assertThat(second.menuApproved()).isFalse();
        assertThat(t.getMenuApprovedAt()).isNull();
    }

    @Test
    void foreignTripNotFound() {
        when(tripRepository.findByIdWithDaysAndMeals(1L, 99L)).thenReturn(Optional.empty());
        assertThatThrownBy(() -> service.toggleMenuApproval(1L, 99L))
                .isInstanceOf(NotFoundException.class);
    }
}

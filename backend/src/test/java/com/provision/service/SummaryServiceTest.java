package com.provision.service;

import com.provision.entity.*;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;

import static org.assertj.core.api.Assertions.assertThat;

@DisplayName("SummaryService Unit Tests")
class SummaryServiceTest {

    private SummaryService summaryService;

    @BeforeEach
    void setUp() {
        // Создаём сервис без моков для простых unit-тестов (тестируются только
        // чистые методы calculateEffectivePeople/calculateAmount*). Фаза 14 (N3):
        // конструктор требует 6-й аргумент TripIngredientEditService — передаём null.
        summaryService = new SummaryService(null, null, null, null, null, null);
    }

    @Test
    @DisplayName("calculateEffectivePeople - meal override")
    void calculateEffectivePeople_mealOverride() {
        Trip trip = Trip.builder().defaultPeople(4).build();
        TripDay day = TripDay.builder().peopleOverride(3).build();
        TripMeal meal = TripMeal.builder().peopleOverride(2).build();

        int result = summaryService.calculateEffectivePeople(trip, day, meal);

        assertThat(result).isEqualTo(2);
    }

    @Test
    @DisplayName("calculateEffectivePeople - day override")
    void calculateEffectivePeople_dayOverride() {
        Trip trip = Trip.builder().defaultPeople(4).build();
        TripDay day = TripDay.builder().peopleOverride(3).build();
        TripMeal meal = TripMeal.builder().peopleOverride(null).build();

        int result = summaryService.calculateEffectivePeople(trip, day, meal);

        assertThat(result).isEqualTo(3);
    }

    @Test
    @DisplayName("calculateEffectivePeople - trip default")
    void calculateEffectivePeople_tripDefault() {
        Trip trip = Trip.builder().defaultPeople(4).build();
        TripDay day = TripDay.builder().peopleOverride(null).build();
        TripMeal meal = TripMeal.builder().peopleOverride(null).build();

        int result = summaryService.calculateEffectivePeople(trip, day, meal);

        assertThat(result).isEqualTo(4);
    }

    @Test
    @DisplayName("calculateAmountPerPerson")
    void calculateAmountPerPerson() {
        BigDecimal amount = new BigDecimal("0.4"); // 400g гречки
        int baseServings = 4;

        BigDecimal result = summaryService.calculateAmountPerPerson(amount, baseServings);

        assertThat(result).isEqualByComparingTo(new BigDecimal("0.100000"));
    }

    @Test
    @DisplayName("calculateAmountForMeal")
    void calculateAmountForMeal() {
        BigDecimal amount = new BigDecimal("0.4"); // 400g на 4 порции
        int baseServings = 4;
        int people = 3;

        BigDecimal result = summaryService.calculateAmountForMeal(amount, baseServings, people);

        // 0.4 / 4 * 3 = 0.3
        assertThat(result).isEqualByComparingTo(new BigDecimal("0.300"));
    }

    @Test
    @DisplayName("calculateAmountForMeal - complex calculation")
    void calculateAmountForMeal_complex() {
        BigDecimal amount = new BigDecimal("0.01"); // 10g соли на 4 порции
        int baseServings = 4;
        int people = 6;

        BigDecimal result = summaryService.calculateAmountForMeal(amount, baseServings, people);

        // 0.01 / 4 * 6 = 0.015
        assertThat(result).isEqualByComparingTo(new BigDecimal("0.015"));
    }
}

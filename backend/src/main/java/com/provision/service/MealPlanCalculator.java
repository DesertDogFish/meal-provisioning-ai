package com.provision.service;

import com.provision.entity.Trip;
import com.provision.entity.TripDay;
import com.provision.entity.TripMeal;

import java.math.BigDecimal;
import java.math.RoundingMode;

/**
 * Подзадача 12 (план plans/done/2026-10-29-full-audit.md): чистая математика плана питания —
 * эффективное число людей, масштабирование amount/baseServings×people, округление итогов
 * до рублей. Без БД и состояния (выделено из SummaryService, логика сохранена дословно).
 */
final class MealPlanCalculator {

    private MealPlanCalculator() {
    }

    static int calculateEffectivePeople(Trip trip, TripDay day, TripMeal meal) {
        if (meal != null && meal.getPeopleOverride() != null) {
            return meal.getPeopleOverride();
        }
        if (day != null && day.getPeopleOverride() != null) {
            return day.getPeopleOverride();
        }
        return trip.getDefaultPeople();
    }

    static BigDecimal calculateAmountPerPerson(BigDecimal amount, int baseServings) {
        return amount.divide(BigDecimal.valueOf(baseServings), 6, RoundingMode.HALF_UP);
    }

    static BigDecimal calculateAmountForMeal(BigDecimal amount, int baseServings, int people) {
        return calculateAmountPerPerson(amount, baseServings)
                .multiply(BigDecimal.valueOf(people))
                .setScale(3, RoundingMode.HALF_UP);
    }

    /**
     * Фаза 14 (требование пользователя): все ИТОГОВЫЕ суммы похода округляются до целых
     * рублей; промежуточные цены за единицу и стоимости отдельных позиций остаются в копейках
     * («в расчёте используем нормальную цену»), иначе «На человека» при малых суммах
     * округлялось бы к нулю.
     */
    static BigDecimal roundToRub(BigDecimal value) {
        if (value == null) {
            return null;
        }
        return value.setScale(0, RoundingMode.HALF_UP);
    }
}

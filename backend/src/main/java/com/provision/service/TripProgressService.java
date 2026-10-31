package com.provision.service;

import com.provision.dto.summary.DayShoppingResponse;
import com.provision.dto.summary.ShoppingItemResponse;
import com.provision.dto.trip.TripProgressResponse;
import com.provision.entity.Trip;
import com.provision.entity.TripDay;
import com.provision.entity.TripShoppingExclusion;
import com.provision.repository.TripShoppingExclusionRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/**
 * План plans/2026-10-31-ux-audit-cleanup-dedup.md (п.8, вариант A): прогресс
 * карточек списка походов — НА СТОРОНЕ СЕРВЕРА, одним запросом GET /trips.
 * Расчёт переиспользует канонический серверный конвейер закупки
 * (SummaryService.computeShoppingForTrip → ShoppingListCalculator) и добавляет
 * то, чего серверный агрегат исторически не знал: исключения (V23) — глобальные
 * вычёркивают позицию, по-дневные уменьшают количество (пересбор агрегата
 * позиции из byDays — та же семантика, что клиентский dayScopedExclusions).
 *
 * Best effort: сбой расчёта одного похода не роняет список (progress = null,
 * карточка просто без строки этапа) — ровно как прежний клиентский best-effort.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class TripProgressService {

    private final SummaryService summaryService;
    private final TripShoppingExclusionRepository exclusionRepository;

    @Transactional(readOnly = true)
    public TripProgressResponse computeForList(Trip trip) {
        try {
            SummaryService.ShoppingComputation comp = summaryService.computeShoppingForTrip(trip);
            List<TripShoppingExclusion> exclusions =
                    exclusionRepository.findByTripId(trip.getId());
            return compute(trip, comp, exclusions);
        } catch (RuntimeException e) {
            log.warn("Trip {} progress unavailable: {}", trip.getId(), e.getMessage());
            return null;
        }
    }

    /** Чистый расчёт — вынесен для unit-тестов (без БД/моков Spring). */
    TripProgressResponse compute(Trip trip,
                                 SummaryService.ShoppingComputation comp,
                                 List<TripShoppingExclusion> exclusions) {
        Set<Long> globalExcl = new HashSet<>();
        Set<String> dayExcl = new HashSet<>();
        for (TripShoppingExclusion e : exclusions) {
            Long ingId = e.getIngredient() != null ? e.getIngredient().getId() : null;
            if (ingId == null) {
                continue;
            }
            if (e.getDayDate() == null) {
                globalExcl.add(ingId);
            } else {
                dayExcl.add(e.getDayDate() + "::" + ingId); // формат ключа клиента (exclusionKey)
            }
        }

        int checklistTotal = 0;
        int facts = 0;
        BigDecimal totalCost = BigDecimal.ZERO;
        for (ShoppingItemResponse it : comp.shoppingList().items()) {
            Long ingId = it.ingredientId();
            if (ingId == null || globalExcl.contains(ingId)) {
                continue; // глобальное исключение — позиция не в деньгах и не в счётчиках
            }
            BigDecimal cost;
            boolean overridden = it.overridden();
            if (hasDayExclusion(dayExcl, ingId)) {
                // по-дневное исключение УМЕНЬШАЕТ количество: пересбор из byDays
                Agg agg = rebuildFromDays(comp.byDays(), ingId, dayExcl);
                cost = agg.actual;
                overridden = overridden || agg.overridden;
            } else {
                cost = nz(it.actualCost(), nz(it.plannedCost(), BigDecimal.ZERO));
            }
            checklistTotal++;
            if (overridden) {
                facts++;
            }
            totalCost = totalCost.add(cost);
        }

        int meals = 0;
        for (TripDay d : trip.getDays() != null ? trip.getDays() : java.util.Collections.<TripDay>emptySet()) {
            meals += d.getMeals() != null ? d.getMeals().size() : 0;
        }
        BigDecimal realPeople = realPeople(trip);
        BigDecimal costPerPerson = realPeople.signum() > 0
                ? totalCost.divide(realPeople, 2, RoundingMode.HALF_UP)
                : totalCost.setScale(2, RoundingMode.HALF_UP);
        String stage = facts > 0 ? "checks" : checklistTotal > 0 ? "shopping" : "menu";

        return new TripProgressResponse(
                stage, meals, checklistTotal, facts, checklistTotal,
                totalCost.setScale(2, RoundingMode.HALF_UP), costPerPerson);
    }

    /** Реальное число людей — среднее эффективных по дням (U33, клиентский realTripPeople). */
    private BigDecimal realPeople(Trip trip) {
        int def = trip.getDefaultPeople() != null ? trip.getDefaultPeople() : 1;
        java.util.Collection<TripDay> days = trip.getDays();
        if (days == null || days.isEmpty()) {
            return BigDecimal.valueOf(Math.max(1, def));
        }
        BigDecimal total = BigDecimal.ZERO;
        for (TripDay d : days) {
            total = total.add(BigDecimal.valueOf(
                    d.getPeopleOverride() != null ? d.getPeopleOverride() : def));
        }
        BigDecimal avg = total.divide(BigDecimal.valueOf(days.size()), 4, RoundingMode.HALF_UP);
        return avg.compareTo(BigDecimal.ONE) < 0 ? BigDecimal.ONE : avg;
    }

    private static boolean hasDayExclusion(Set<String> dayExcl, Long ingredientId) {
        String suffix = "::" + ingredientId;
        for (String key : dayExcl) {
            if (key.endsWith(suffix)) {
                return true;
            }
        }
        return false;
    }

    private record Agg(BigDecimal actual, boolean overridden) {}

    /** Пересбор агрегата позиции из по-дневных строк, пропуская исключённые дни. */
    private static Agg rebuildFromDays(List<DayShoppingResponse> byDays, Long ingredientId, Set<String> dayExcl) {
        BigDecimal actual = BigDecimal.ZERO;
        boolean overridden = false;
        for (DayShoppingResponse day : byDays) {
            if (day.items() == null) {
                continue;
            }
            for (ShoppingItemResponse it : day.items()) {
                if (!ingredientId.equals(it.ingredientId())) {
                    continue;
                }
                if (dayExcl.contains(day.dayDate() + "::" + ingredientId)) {
                    continue; // день исключён — его количество/деньги не считаются
                }
                actual = actual.add(nz(it.actualCost(), nz(it.plannedCost(), BigDecimal.ZERO)));
                overridden = overridden || it.overridden();
            }
        }
        return new Agg(actual, overridden);
    }

    private static BigDecimal nz(BigDecimal v, BigDecimal fallback) {
        return v != null ? v : fallback;
    }
}

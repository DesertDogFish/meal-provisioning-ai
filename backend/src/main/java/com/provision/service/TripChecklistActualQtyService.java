package com.provision.service;

import com.provision.dto.trip.ChecklistActualQtyDtos;
import com.provision.entity.Ingredient;
import com.provision.entity.Trip;
import com.provision.entity.TripChecklistActualQty;
import com.provision.entity.User;
import com.provision.exception.NotFoundException;
import com.provision.repository.IngredientRepository;
import com.provision.repository.TripChecklistActualQtyRepository;
import com.provision.repository.TripRepository;
import com.provision.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * BL-27: серверный факт «сколько реально берём/взяли» в чеклисте похода (persist-слой).
 *
 * <p>Семантика та же, что у {@link TripChecklistBoughtService}: чужой поход отдаёт 404
 * (не раскрываем существование чужих походов), PUT — идемпотентная ПОЛНАЯ замена
 * набора, дубли ingredientId в теле схлопываются (последнее значение выигрывает).</p>
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class TripChecklistActualQtyService {

    private final TripChecklistActualQtyRepository actualQtyRepository;
    private final TripRepository tripRepository;
    private final IngredientRepository ingredientRepository;
    private final UserRepository userRepository;

    private Trip getOwnedTrip(Long tripId, Long userId) {
        Trip trip = tripRepository.findById(tripId)
                .orElseThrow(() -> new NotFoundException("Trip not found"));
        if (!trip.getUser().getId().equals(userId)) {
            throw new NotFoundException("Trip not found");
        }
        return trip;
    }

    @Transactional(readOnly = true)
    public List<ChecklistActualQtyDtos.Item> list(Long tripId, Long userId) {
        getOwnedTrip(tripId, userId);
        List<TripChecklistActualQty> rows = actualQtyRepository.findByTripId(tripId);
        log.debug("Checklist actual qty list: tripId={}, userId={}, rows={}", tripId, userId, rows.size());
        return toItems(rows);
    }

    /**
     * Идемпотентная полная замена набора фактов (PUT из UI).
     *
     * <p>Пачка продуктов проверяется ДО удаления старых строк: неизвестный
     * ингредиент → 404 и откат всей транзакции (набор остаётся прежним).</p>
     */
    @Transactional
    public List<ChecklistActualQtyDtos.Item> replaceAll(
            Long tripId, ChecklistActualQtyDtos.ItemsBody body, Long userId) {
        Trip trip = getOwnedTrip(tripId, userId);

        // Дедупликация по ingredientId: последнее значение выигрывает (клиентская
        // карта по ingredientId в принципе не может прислать дубль, но защищаемся).
        Map<Long, ChecklistActualQtyDtos.Item> desired = new LinkedHashMap<>();
        for (ChecklistActualQtyDtos.Item it : body.items()) {
            if (it != null && it.ingredientId() != null && it.amount() != null) {
                desired.put(it.ingredientId(), it);
            }
        }

        List<Long> ingredientIds = List.copyOf(desired.keySet());
        Map<Long, Ingredient> found = ingredientIds.isEmpty()
                ? Map.of()
                : ingredientRepository.findAllById(ingredientIds).stream()
                        .collect(Collectors.toMap(Ingredient::getId, Function.identity()));
        if (found.size() < ingredientIds.size()) {
            List<Long> missing = ingredientIds.stream()
                    .filter(id -> !found.containsKey(id))
                    .toList();
            log.warn("Checklist actual qty replace rejected: tripId={}, userId={}, missingIngredientIds={}",
                    tripId, userId, missing);
            throw new NotFoundException("Ingredient not found: " + missing);
        }

        User actor = userRepository.findById(userId)
                .orElseThrow(() -> new NotFoundException("User not found"));

        actualQtyRepository.deleteAllByTripId(tripId);

        List<TripChecklistActualQty> fresh = new ArrayList<>(desired.size());
        for (ChecklistActualQtyDtos.Item it : desired.values()) {
            fresh.add(TripChecklistActualQty.builder()
                    .trip(trip)
                    .ingredient(found.get(it.ingredientId()))
                    .amount(it.amount())
                    .unit(it.unit().trim())
                    .createdBy(actor)
                    .build());
        }
        actualQtyRepository.saveAll(fresh);

        List<TripChecklistActualQty> saved = actualQtyRepository.findByTripId(tripId);
        log.info("Checklist actual qty replaced: tripId={}, userId={}, itemsAccepted={}, itemsSaved={}",
                tripId, userId, body.items().size(), saved.size());
        return toItems(saved);
    }

    private List<ChecklistActualQtyDtos.Item> toItems(List<TripChecklistActualQty> rows) {
        return rows.stream()
                .map(q -> new ChecklistActualQtyDtos.Item(
                        q.getIngredient().getId(), q.getAmount(), q.getUnit()))
                .toList();
    }
}

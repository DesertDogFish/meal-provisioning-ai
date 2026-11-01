package com.provision.service;

import com.provision.dto.trip.ChecklistBoughtDtos;
import com.provision.entity.Ingredient;
import com.provision.entity.Trip;
import com.provision.entity.TripChecklistBought;
import com.provision.entity.User;
import com.provision.exception.NotFoundException;
import com.provision.repository.IngredientRepository;
import com.provision.repository.TripChecklistBoughtRepository;
import com.provision.repository.TripRepository;
import com.provision.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * KB-15: серверное хранение отметок «взято» в чеклисте похода (persist-слой).
 *
 * Проверка владения походом — как в {@link TripShoppingExclusionService}: чужой
 * поход отдаёт 404 (не раскрываем существование чужих походов).
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class TripChecklistBoughtService {

    private final TripChecklistBoughtRepository boughtRepository;
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
    public List<ChecklistBoughtDtos.Item> list(Long tripId, Long userId) {
        getOwnedTrip(tripId, userId);
        List<TripChecklistBought> rows = boughtRepository.findByTripId(tripId);
        log.debug("Checklist bought list: tripId={}, userId={}, rows={}", tripId, userId, rows.size());
        return toItems(rows);
    }

    /**
     * Идемпотентная полная замена набора отметок (PUT из UI).
     * Дубликаты пар (ingredientId, neededStamp) схлопываются — иначе падает
     * уникальный индекс uq_tcb_trip_ingredient_stamp.
     *
     * Тело запроса не может быть null: контроллер объявляет {@code @RequestBody}
     * обязательным и {@code @Valid}, а {@code ItemsBody.items} помечен {@code @NotNull}
     * (иначе запрос отсекается на валидации с 400).
     */
    @Transactional
    public List<ChecklistBoughtDtos.Item> replaceAll(
            Long tripId, ChecklistBoughtDtos.ItemsBody body, Long userId) {
        Trip trip = getOwnedTrip(tripId, userId);

        // Дедупликация с сохранением порядка прихода.
        Set<ChecklistBoughtDtos.Item> desired = new LinkedHashSet<>();
        for (ChecklistBoughtDtos.Item it : body.items()) {
            if (it != null && it.ingredientId() != null && it.neededStamp() != null) {
                desired.add(new ChecklistBoughtDtos.Item(it.ingredientId(), it.neededStamp()));
            }
        }

        // Один запрос на весь набор вместо findById в цикле (было N+1).
        // Пачка проверяется ДО удаления старых строк: неизвестный ингредиент —
        // 404 и откат всей транзакции (набор остаётся прежним).
        List<Long> ingredientIds = desired.stream()
                .map(ChecklistBoughtDtos.Item::ingredientId)
                .distinct()
                .toList();
        Map<Long, Ingredient> found = ingredientIds.isEmpty()
                ? Map.of()
                : ingredientRepository.findAllById(ingredientIds).stream()
                        .collect(Collectors.toMap(Ingredient::getId, Function.identity()));
        if (found.size() < ingredientIds.size()) {
            List<Long> missing = ingredientIds.stream()
                    .filter(id -> !found.containsKey(id))
                    .toList();
            log.warn("Checklist bought replace rejected: tripId={}, userId={}, missingIngredientIds={}",
                    tripId, userId, missing);
            throw new NotFoundException("Ingredient not found: " + missing);
        }

        // Аудит: created_by заполняем актором (у trip_shopping_exclusions это поле
        // оставалось NULL — здесь не повторяем).
        User actor = userRepository.findById(userId)
                .orElseThrow(() -> new NotFoundException("User not found"));

        boughtRepository.deleteAllByTripId(tripId);

        List<TripChecklistBought> fresh = new ArrayList<>(desired.size());
        for (ChecklistBoughtDtos.Item it : desired) {
            fresh.add(TripChecklistBought.builder()
                    .trip(trip)
                    .ingredient(found.get(it.ingredientId()))
                    .neededStamp(it.neededStamp())
                    .createdBy(actor)
                    .build());
        }
        boughtRepository.saveAll(fresh);

        List<TripChecklistBought> saved = boughtRepository.findByTripId(tripId);
        log.info("Checklist bought replaced: tripId={}, userId={}, itemsAccepted={}, itemsSaved={}",
                tripId, userId, body.items().size(), saved.size());
        return toItems(saved);
    }

    private List<ChecklistBoughtDtos.Item> toItems(List<TripChecklistBought> rows) {
        return rows.stream()
                .map(b -> new ChecklistBoughtDtos.Item(b.getIngredient().getId(), b.getNeededStamp()))
                .toList();
    }
}

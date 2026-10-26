package com.provision.service;

import com.provision.dto.trip.ManualItemRequest;
import com.provision.dto.trip.ManualItemResponse;
import com.provision.entity.Ingredient;
import com.provision.entity.Trip;
import com.provision.entity.TripDay;
import com.provision.entity.TripManualItem;
import com.provision.entity.User;
import com.provision.exception.NotFoundException;
import com.provision.repository.IngredientRepository;
import com.provision.repository.TripDayRepository;
import com.provision.repository.TripManualItemRepository;
import com.provision.repository.TripRepository;
import com.provision.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

/**
 * Fix-2 (список 26.10, U40 / PLAN R3): ручные позиции закупки — продукты к дню
 * или ко всему походу вне блюд (аптечка, антисептик, топливо).
 *
 * Ownership: все операции только в рамках своего похода (чужой поход → 404,
 * шаблон TripService). День — только принадлежащий этому походу.
 *
 * AGENTS §9: ingredient резолвится в trip-scoped копию продукта, если она есть
 * у похода (иначе id позиции и id строки закупки из снепшот-рецепта не совпали бы
 * и один продукт дал бы две строки в агрегате).
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class TripManualItemService {

    private final TripRepository tripRepository;
    private final TripDayRepository tripDayRepository;
    private final IngredientRepository ingredientRepository;
    private final TripManualItemRepository manualItemRepository;
    private final UserRepository userRepository;

    @Transactional(readOnly = true)
    public List<ManualItemResponse> getItems(Long tripId, Long userId) {
        Trip trip = requireOwnedTrip(tripId, userId);
        return manualItemRepository.findByTripIdWithRefs(trip.getId()).stream()
                .map(this::toResponse)
                .toList();
    }

    @Transactional
    public ManualItemResponse addItem(Long tripId, ManualItemRequest request, Long userId) {
        Trip trip = requireOwnedTrip(tripId, userId);

        TripDay day = null;
        if (request.dayId() != null) {
            day = tripDayRepository.findById(request.dayId())
                    .filter(d -> d.getTrip().getId().equals(trip.getId()))
                    .orElseThrow(() -> new NotFoundException("Trip day not found"));
        }

        Ingredient ingredient = ingredientRepository.findById(request.ingredientId())
                .orElseThrow(() -> new NotFoundException("Ingredient not found"));
        // AGENTS §9: глобальный продукт → trip-scoped копия похода (если создана)
        Ingredient resolved = ingredient.getTripId() == null
                ? ingredientRepository.findByTripIdAndSnapshotOf(trip.getId(), ingredient.getId())
                        .orElse(ingredient)
                : ingredient;

        User createdBy = userRepository.findById(userId).orElse(null);

        TripManualItem item = TripManualItem.builder()
                .trip(trip)
                .day(day)
                .ingredient(resolved)
                .amount(request.amount())
                .note(request.note())
                .createdBy(createdBy)
                .build();

        item = manualItemRepository.save(item);
        log.info("Manual item added: trip={} day={} ingredient={} amount={}",
                tripId, request.dayId(), resolved.getId(), request.amount());
        return toResponse(item);
    }

    @Transactional
    public void deleteItem(Long tripId, Long itemId, Long userId) {
        Trip trip = requireOwnedTrip(tripId, userId);
        TripManualItem item = manualItemRepository.findById(itemId)
                .filter(i -> i.getTrip().getId().equals(trip.getId()))
                .orElseThrow(() -> new NotFoundException("Manual item not found"));
        manualItemRepository.delete(item);
        log.info("Manual item deleted: trip={} item={}", tripId, itemId);
    }

    private Trip requireOwnedTrip(Long tripId, Long userId) {
        return tripRepository.findByIdAndUserId(tripId, userId)
                .orElseThrow(() -> new NotFoundException("Trip not found or access denied"));
    }

    private ManualItemResponse toResponse(TripManualItem item) {
        Ingredient ing = item.getIngredient();
        return new ManualItemResponse(
                item.getId(),
                item.getTrip().getId(),
                item.getDay() != null ? item.getDay().getId() : null,
                ing.getId(),
                ing.getName(),
                ing.getUnit().name(),
                item.getAmount(),
                item.getNote(),
                item.getCreatedAt()
        );
    }
}

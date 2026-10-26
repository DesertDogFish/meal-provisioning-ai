package com.provision.controller;

import com.provision.dto.trip.ManualItemRequest;
import com.provision.dto.trip.ManualItemResponse;
import com.provision.entity.User;
import com.provision.service.TripManualItemService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * Fix-2 (список 26.10, U40 / PLAN R3): ручные позиции закупки.
 * Контракт — паритет с mock (`mockServer.ts`) и фронтовым `api/tripManualItems.ts`:
 *   GET    /api/v1/trips/{tripId}/manual-items           → ManualItemResponse[]
 *   POST   /api/v1/trips/{tripId}/manual-items           → ManualItemResponse (201)
 *   DELETE /api/v1/trips/{tripId}/manual-items/{itemId}  → 204
 * Авторизация: anyRequest().authenticated() (SecurityConfig); ownership — в сервисе.
 */
@RestController
@RequestMapping("/api/v1/trips/{tripId}/manual-items")
@RequiredArgsConstructor
public class TripManualItemController {

    private final TripManualItemService manualItemService;

    @GetMapping
    public List<ManualItemResponse> getItems(
            @PathVariable Long tripId,
            @AuthenticationPrincipal User user
    ) {
        return manualItemService.getItems(tripId, user.getId());
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public ManualItemResponse addItem(
            @PathVariable Long tripId,
            @Valid @RequestBody ManualItemRequest request,
            @AuthenticationPrincipal User user
    ) {
        return manualItemService.addItem(tripId, request, user.getId());
    }

    @DeleteMapping("/{itemId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteItem(
            @PathVariable Long tripId,
            @PathVariable Long itemId,
            @AuthenticationPrincipal User user
    ) {
        manualItemService.deleteItem(tripId, itemId, user.getId());
    }
}

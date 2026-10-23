package com.provision.controller;

import com.provision.entity.User;
import com.provision.service.TripShoppingExclusionService;
import jakarta.validation.constraints.NotNull;
import lombok.RequiredArgsConstructor;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * Фаза 14: мягкие исключения продуктов из расчёта закупки похода
 * («удалить из расчёта, но не удалять до конца»). Frontend синхронизирует
 * локальный стейдж (tripStaging) идемпотентным PUT всего набора.
 */
@RestController
@RequestMapping("/api/v1/trips/{tripId}/shopping-exclusions")
@RequiredArgsConstructor
public class ShoppingExclusionController {

    private final TripShoppingExclusionService exclusionService;

    public record ExclusionsBody(@NotNull List<Long> ingredientIds) {}

    @GetMapping
    public List<Long> list(@PathVariable Long tripId, @AuthenticationPrincipal User user) {
        return exclusionService.list(tripId, user.getId());
    }

    @PutMapping
    public List<Long> replaceAll(
            @PathVariable Long tripId,
            @RequestBody ExclusionsBody body,
            @AuthenticationPrincipal User user
    ) {
        return exclusionService.replaceAll(tripId,
                body == null || body.ingredientIds() == null ? List.of() : body.ingredientIds(),
                user.getId());
    }

    @DeleteMapping("/{ingredientId}")
    @ResponseStatus(org.springframework.http.HttpStatus.NO_CONTENT)
    public void remove(
            @PathVariable Long tripId,
            @PathVariable Long ingredientId,
            @AuthenticationPrincipal User user
    ) {
        exclusionService.remove(tripId, ingredientId, user.getId());
    }
}

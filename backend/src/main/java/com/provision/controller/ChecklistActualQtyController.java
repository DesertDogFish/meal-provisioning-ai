package com.provision.controller;

import com.provision.dto.trip.ChecklistActualQtyDtos;
import com.provision.entity.User;
import com.provision.service.TripChecklistActualQtyService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * BL-27: серверное ФАКТИЧЕСКОЕ количество чеклиста похода («сколько реально
 * берём/взяли»). Клиент синхронизирует набор идемпотентным PUT всей карты —
 * ровно так же, как отметки «взято» ({@link ChecklistBoughtController}).
 */
@RestController
@RequestMapping("/api/v1/trips/{tripId}/checklist-actual-qty")
@RequiredArgsConstructor
public class ChecklistActualQtyController {

    private final TripChecklistActualQtyService actualQtyService;

    @GetMapping
    public List<ChecklistActualQtyDtos.Item> list(@PathVariable Long tripId, @AuthenticationPrincipal User user) {
        return actualQtyService.list(tripId, user.getId());
    }

    @PutMapping
    public List<ChecklistActualQtyDtos.Item> replaceAll(
            @PathVariable Long tripId,
            @Valid @RequestBody ChecklistActualQtyDtos.ItemsBody body,
            @AuthenticationPrincipal User user
    ) {
        return actualQtyService.replaceAll(tripId, body, user.getId());
    }
}

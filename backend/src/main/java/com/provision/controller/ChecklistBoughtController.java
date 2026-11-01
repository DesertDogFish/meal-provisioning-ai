package com.provision.controller;

import com.provision.dto.trip.ChecklistBoughtDtos;
import com.provision.entity.User;
import com.provision.service.TripChecklistBoughtService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * KB-15: серверные отметки «взято» в чеклисте похода.
 *
 * Раньше отметки жили только в localStorage браузера — теперь frontend
 * синхронизирует стейдж идемпотентным PUT всего набора.
 */
@RestController
@RequestMapping("/api/v1/trips/{tripId}/checklist-bought")
@RequiredArgsConstructor
public class ChecklistBoughtController {

    private final TripChecklistBoughtService boughtService;

    @GetMapping
    public List<ChecklistBoughtDtos.Item> list(@PathVariable Long tripId, @AuthenticationPrincipal User user) {
        return boughtService.list(tripId, user.getId());
    }

    @PutMapping
    public List<ChecklistBoughtDtos.Item> replaceAll(
            @PathVariable Long tripId,
            @Valid @RequestBody ChecklistBoughtDtos.ItemsBody body,
            @AuthenticationPrincipal User user
    ) {
        return boughtService.replaceAll(tripId, body, user.getId());
    }
}

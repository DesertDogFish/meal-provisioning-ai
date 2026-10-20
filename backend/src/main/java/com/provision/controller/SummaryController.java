package com.provision.controller;

import com.provision.dto.summary.*;
import com.provision.entity.User;
import com.provision.service.SummaryService;
import lombok.RequiredArgsConstructor;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/v1/trips/{tripId}/summary")
@RequiredArgsConstructor
public class SummaryController {

    private final SummaryService summaryService;

    @GetMapping("/menu")
    public List<MenuByDayResponse> getMenuByDays(
            @PathVariable Long tripId,
            @AuthenticationPrincipal User user
    ) {
        return summaryService.getMenuByDays(tripId, user.getId());
    }

    @GetMapping("/shopping")
    public ShoppingListResponse getShoppingList(
            @PathVariable Long tripId,
            @AuthenticationPrincipal User user
    ) {
        return summaryService.getShoppingList(tripId, user.getId());
    }

    @GetMapping("/shopping/by-days")
    public List<DayShoppingResponse> getShoppingByDays(
            @PathVariable Long tripId,
            @AuthenticationPrincipal User user
    ) {
        return summaryService.getShoppingByDays(tripId, user.getId());
    }

    @GetMapping("/person")
    public PersonSummaryResponse getPersonSummary(
            @PathVariable Long tripId,
            @AuthenticationPrincipal User user
    ) {
        return summaryService.getPersonSummary(tripId, user.getId());
    }
}

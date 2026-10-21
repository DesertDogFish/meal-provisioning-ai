package com.provision.controller;

import com.provision.dto.staging.*;
import com.provision.entity.User;
import com.provision.service.StagingService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/v1/admin/staging")
@RequiredArgsConstructor
@PreAuthorize("hasRole('ADMIN')")
public class StagingController {

    private final StagingService stagingService;

    @GetMapping
    public List<StagingRecipeResponse> getAllStagingRecipes(
            @RequestParam(required = false) String status
    ) {
        if (status != null) {
            return stagingService.getStagingRecipesByStatus(status);
        }
        return stagingService.getAllStagingRecipes();
    }

    @GetMapping("/{id}")
    public StagingRecipeResponse getStagingRecipe(@PathVariable Long id) {
        return stagingService.getStagingRecipe(id);
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public StagingRecipeResponse createStagingRecipe(@Valid @RequestBody StagingRecipeRequest request) {
        return stagingService.createStagingRecipe(request);
    }

    @PostMapping("/{id}/approve")
    public void approveStagingRecipe(
            @PathVariable Long id,
            @Valid @RequestBody ApproveStagingRequest request,
            @AuthenticationPrincipal User user
    ) {
        stagingService.approveStagingRecipe(id, request, user.getId());
    }

    @PostMapping("/{id}/reject")
    public void rejectStagingRecipe(
            @PathVariable Long id,
            @Valid @RequestBody RejectStagingRequest request,
            @AuthenticationPrincipal User user
    ) {
        stagingService.rejectStagingRecipe(id, request, user.getId());
    }
}

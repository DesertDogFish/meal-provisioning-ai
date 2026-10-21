package com.provision.controller;

import com.provision.dto.trip.SubstitutionRequest;
import com.provision.dto.trip.SubstitutionResponse;
import com.provision.entity.User;
import com.provision.service.SubstitutionService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/v1/trips/{tripId}/substitutions")
@RequiredArgsConstructor
public class SubstitutionController {

    private final SubstitutionService substitutionService;

    @GetMapping
    public List<SubstitutionResponse> getSubstitutions(
            @PathVariable Long tripId,
            @AuthenticationPrincipal User user
    ) {
        return substitutionService.getSubstitutions(tripId, user.getId());
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public SubstitutionResponse createSubstitution(
            @PathVariable Long tripId,
            @Valid @RequestBody SubstitutionRequest request,
            @AuthenticationPrincipal User user
    ) {
        return substitutionService.createSubstitution(tripId, request, user.getId());
    }

    @DeleteMapping("/{substitutionId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteSubstitution(
            @PathVariable Long tripId,
            @PathVariable Long substitutionId,
            @AuthenticationPrincipal User user
    ) {
        substitutionService.deleteSubstitution(tripId, substitutionId, user.getId());
    }
}

package com.provision.controller;

import com.provision.dto.trip.SubstitutionRequest;
import com.provision.dto.trip.TripIngredientEditRequest;
import com.provision.dto.trip.TripIngredientEditResponse;
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

    // ===== Фаза 14 (N3): пер-походные правки состава блюда (add/replace/remove) =====

    /** GET /trips/{id}/ingredient-edits — все правки состава похода. */
    @GetMapping("/ingredient-edits")
    public List<TripIngredientEditResponse> getEdits(
            @PathVariable Long tripId,
            @AuthenticationPrincipal User user
    ) {
        return substitutionService.getEdits(tripId, user.getId());
    }

    /** POST /trips/{id}/ingredient-edits — создать замену/добавление/мягкое удаление. */
    @PostMapping("/ingredient-edits")
    @ResponseStatus(HttpStatus.CREATED)
    public TripIngredientEditResponse createEdit(
            @PathVariable Long tripId,
            @Valid @RequestBody TripIngredientEditRequest request,
            @AuthenticationPrincipal User user
    ) {
        return substitutionService.createEdit(tripId, request, user.getId());
    }

    /** DELETE /trips/{id}/ingredient-edits/{editId} — отменить правку (рецепт не менялся). */
    @DeleteMapping("/ingredient-edits/{editId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteEdit(
            @PathVariable Long tripId,
            @PathVariable Long editId,
            @AuthenticationPrincipal User user
    ) {
        substitutionService.deleteEdit(tripId, editId, user.getId());
    }
}

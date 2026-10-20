package com.provision.controller;

import com.provision.dto.ingredient.IngredientRequest;
import com.provision.dto.ingredient.IngredientResponse;
import com.provision.service.IngredientService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/v1/admin/ingredients")
@RequiredArgsConstructor
@PreAuthorize("hasRole('ADMIN')")
public class IngredientController {

    private final IngredientService ingredientService;

    @GetMapping
    public List<IngredientResponse> getAllIngredients() {
        return ingredientService.getAllIngredients();
    }

    @GetMapping("/{id}")
    public IngredientResponse getIngredient(@PathVariable Long id) {
        return ingredientService.getIngredient(id);
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public IngredientResponse createIngredient(@Valid @RequestBody IngredientRequest request) {
        return ingredientService.createIngredient(request);
    }

    @PutMapping("/{id}")
    public IngredientResponse updateIngredient(
            @PathVariable Long id,
            @Valid @RequestBody IngredientRequest request
    ) {
        return ingredientService.updateIngredient(id, request);
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteIngredient(@PathVariable Long id) {
        ingredientService.deleteIngredient(id);
    }
}

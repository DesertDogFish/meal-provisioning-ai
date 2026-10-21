package com.provision.controller;

import com.provision.dto.ingredient.IngredientPriceRequest;
import com.provision.dto.ingredient.IngredientPriceResponse;
import com.provision.service.IngredientPriceService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/v1/admin/ingredient-prices")
@RequiredArgsConstructor
@PreAuthorize("hasRole('ADMIN')")
public class IngredientPriceController {

    private final IngredientPriceService priceService;

    @GetMapping("/ingredient/{ingredientId}")
    public List<IngredientPriceResponse> getPricesByIngredient(@PathVariable Long ingredientId) {
        return priceService.getPricesByIngredient(ingredientId);
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public IngredientPriceResponse addPrice(@Valid @RequestBody IngredientPriceRequest request) {
        return priceService.addPrice(request);
    }
}

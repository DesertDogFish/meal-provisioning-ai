package com.provision.controller;

import com.provision.dto.staging.IngredientMappingRequest;
import com.provision.dto.staging.IngredientMappingResponse;
import com.provision.entity.RecipeSource;
import com.provision.service.IngredientMappingService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/v1/admin/ingredient-mappings")
@RequiredArgsConstructor
@PreAuthorize("hasRole('ADMIN')")
public class IngredientMappingController {

    private final IngredientMappingService mappingService;

    @GetMapping
    public List<IngredientMappingResponse> getAllMappings(
            @RequestParam(required = false) RecipeSource source
    ) {
        if (source != null) {
            return mappingService.getMappingsBySource(source);
        }
        return mappingService.getAllMappings();
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public IngredientMappingResponse createMapping(@Valid @RequestBody IngredientMappingRequest request) {
        return mappingService.createMapping(request);
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteMapping(@PathVariable Long id) {
        mappingService.deleteMapping(id);
    }
}

package com.provision.controller;

import com.provision.dto.integration.IngredientMappingRequest;
import com.provision.dto.integration.IntegrationDto;
import com.provision.dto.integration.SyncLogDto;
import com.provision.integration.ExternalProductDto;
import com.provision.service.IntegrationService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/v1/admin/integrations")
@RequiredArgsConstructor
@PreAuthorize("hasRole('ADMIN')")
public class IntegrationController {

    private final IntegrationService integrationService;

    @GetMapping
    public List<IntegrationDto> getAllIntegrations() {
        return integrationService.getAllIntegrations();
    }

    @PostMapping("/{provider}/connect")
    public IntegrationDto connect(@PathVariable String provider) {
        return integrationService.connect(provider);
    }

    @PostMapping("/{provider}/disconnect")
    public IntegrationDto disconnect(@PathVariable String provider) {
        return integrationService.disconnect(provider);
    }

    @GetMapping("/{provider}/products/search")
    public List<ExternalProductDto> searchProducts(
            @PathVariable String provider,
            @RequestParam String query,
            @RequestParam(defaultValue = "20") int limit) {
        return integrationService.searchProducts(provider, query, limit);
    }

    @PostMapping("/ingredients/{ingredientId}/mapping")
    public ResponseEntity<Void> createMapping(
            @PathVariable Long ingredientId,
            @Valid @RequestBody IngredientMappingRequest request) {
        integrationService.createMapping(ingredientId, request);
        return ResponseEntity.ok().build();
    }

    @DeleteMapping("/ingredients/{ingredientId}/mapping/{provider}")
    public ResponseEntity<Void> deleteMapping(
            @PathVariable Long ingredientId,
            @PathVariable String provider) {
        integrationService.deleteMapping(ingredientId, provider);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/{provider}/sync/prices")
    public SyncLogDto syncPrices(@PathVariable String provider) {
        return integrationService.syncPrices(provider);
    }

    @GetMapping("/sync-logs")
    public List<SyncLogDto> getSyncLogs(
            @RequestParam(required = false) String provider) {
        return integrationService.getSyncLogs(provider);
    }
}

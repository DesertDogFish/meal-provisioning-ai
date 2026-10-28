package com.provision.controller;

import com.provision.dto.integration.IngredientBindingDto;
import com.provision.dto.integration.IngredientMappingRequest;
import com.provision.dto.integration.IntegrationDto;
import com.provision.dto.integration.SyncLogDto;
import com.provision.integration.ExternalProductDto;
import com.provision.service.IntegrationService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

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

    @GetMapping("/{provider}/mappings")
    public List<IngredientBindingDto> getMappings(@PathVariable String provider) {
        return integrationService.getMappings(provider);
    }

    @PostMapping("/ingredients/{ingredientId}/mapping")
    public IngredientBindingDto createMapping(
            @PathVariable Long ingredientId,
            @Valid @RequestBody IngredientMappingRequest request) {
        // Fix-15: 200 + тело привязки. Раньше — ResponseEntity.ok().build()
        // (пустое тело), из-за чего фронтенд response.json() падал с
        // «Failed to execute 'json' on 'Response': Unexpected end of JSON input»,
        // хотя маппинг фактически создавался.
        return integrationService.createMapping(ingredientId, request);
    }

    @DeleteMapping("/ingredients/{ingredientId}/mapping/{provider}")
    public ResponseEntity<Void> deleteMapping(
            @PathVariable Long ingredientId,
            @PathVariable String provider) {
        integrationService.deleteMapping(ingredientId, provider);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/{provider}/sync/prices")
    public ResponseEntity<Map<String, Long>> syncPrices(
            @PathVariable String provider,
            @AuthenticationPrincipal com.provision.entity.User user
    ) {
        var syncLog = integrationService.syncPrices(provider, user.getId());
        return ResponseEntity.status(HttpStatus.ACCEPTED)
                .body(Map.of("logId", syncLog.getId()));
    }

    @GetMapping("/sync-logs")
    public List<SyncLogDto> getSyncLogs(
            @RequestParam(required = false) String provider) {
        return integrationService.getSyncLogs(provider);
    }
}

package com.provision.dto.integration;

import java.time.LocalDateTime;

public record IntegrationDto(
    Long id,
    String provider,
    String status,
    String baseUrl,
    LocalDateTime lastConnectedAt,
    LocalDateTime lastSyncAt,
    String errorMessage
) {}

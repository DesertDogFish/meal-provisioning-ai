package com.provision.dto.integration;

import java.time.LocalDateTime;

public record SyncLogDto(
    Long id,
    String provider,
    String type,
    String status,
    LocalDateTime startedAt,
    LocalDateTime finishedAt,
    Integer createdCount,
    Integer updatedCount,
    Integer errorCount
) {}

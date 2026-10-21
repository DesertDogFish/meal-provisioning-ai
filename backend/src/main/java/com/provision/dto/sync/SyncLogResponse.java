package com.provision.dto.sync;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

public record SyncLogResponse(
    Long id,
    String provider,
    String type,
    String status,
    String triggeredBy,
    String triggeredUserEmail,
    LocalDateTime startedAt,
    LocalDateTime finishedAt,
    Double durationSeconds,
    Integer createdCount,
    Integer updatedCount,
    Integer errorCount,
    SyncDetails details
) {
    public record SyncDetails(
        Integer requestCount,
        List<SyncItem> items,
        List<SyncError> errors
    ) {}
    
    public record SyncItem(
        Long productId,
        String productName,
        String externalCode,
        LocalDate priceDate,
        BigDecimal oldPrice,
        BigDecimal newPrice,
        String action,
        String reason,
        Boolean anomaly
    ) {}
    
    public record SyncError(
        String externalCode,
        String message
    ) {}
}

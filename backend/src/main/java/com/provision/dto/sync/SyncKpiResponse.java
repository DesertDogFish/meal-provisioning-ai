package com.provision.dto.sync;

public record SyncKpiResponse(
    Long totalRuns,
    Double successRate,
    Long totalUpdated,
    Long totalErrors
) {}

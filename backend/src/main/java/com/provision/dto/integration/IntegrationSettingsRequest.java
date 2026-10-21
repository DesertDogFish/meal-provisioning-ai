package com.provision.dto.integration;

import jakarta.validation.constraints.Pattern;

public record IntegrationSettingsRequest(
    Boolean autoSync,
    @Pattern(regexp = "^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$", message = "Time must be in HH:MM format")
    String autoSyncTime
) {}

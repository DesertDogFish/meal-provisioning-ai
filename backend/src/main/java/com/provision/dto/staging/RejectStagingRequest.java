package com.provision.dto.staging;

import jakarta.validation.constraints.NotBlank;

public record RejectStagingRequest(
    @NotBlank
    String reason
) {}

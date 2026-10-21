package com.provision.dto.product;

public record CheckNameResponse(
    boolean duplicate,
    Long existingId,
    String existingName,
    boolean sameUnit
) {}

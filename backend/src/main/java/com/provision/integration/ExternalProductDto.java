package com.provision.integration;

import java.math.BigDecimal;

public record ExternalProductDto(
    String code,
    String name,
    String brand,
    BigDecimal packAmount,
    String packUnit,
    String imageUrl
) {}

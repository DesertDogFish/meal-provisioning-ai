package com.provision.integration;

import java.math.BigDecimal;
import java.time.LocalDate;

public record ExternalPriceDto(
    String code,
    BigDecimal price,
    String currency,
    LocalDate date
) {}

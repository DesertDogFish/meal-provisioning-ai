package com.provision.dto.product;

public record ProductCategoryDto(
    Long id,
    String name,
    String slug,
    Integer sortOrder
) {}

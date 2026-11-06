package com.provision.service;

import com.provision.entity.Ingredient;

import java.math.BigDecimal;

final class ShoppingAggregation {
    private final Ingredient ingredient;
    private BigDecimal totalAmount = BigDecimal.ZERO;
    String substitutedFromName;

    ShoppingAggregation(Ingredient ingredient) {
        this.ingredient = ingredient;
    }

    Ingredient ingredient() {
        return ingredient;
    }

    BigDecimal totalAmount() {
        return totalAmount;
    }

    void addAmount(BigDecimal amount) {
        totalAmount = totalAmount.add(amount);
    }
}

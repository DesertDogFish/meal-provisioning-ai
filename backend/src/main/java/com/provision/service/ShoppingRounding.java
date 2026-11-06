package com.provision.service;

import java.math.BigDecimal;
import java.math.RoundingMode;

final class ShoppingRounding {
    public static final RoundingMode MODE = RoundingMode.HALF_UP;
    public static final int AMOUNT_SCALE = 3;
    public static final int MONEY_SCALE = 2;
    public static final int RUB_SCALE = 0;
    public static final int DELTA_INTERMEDIATE_SCALE = 4;
    public static final int DELTA_FINAL_SCALE = 2;

    private ShoppingRounding() {}

    public static BigDecimal scaleAmount(BigDecimal v) {
        if (v == null) return null;
        return v.setScale(AMOUNT_SCALE, MODE);
    }

    public static BigDecimal scaleMoney(BigDecimal v) {
        if (v == null) return null;
        return v.setScale(MONEY_SCALE, MODE);
    }

    public static BigDecimal roundToRub(BigDecimal v) {
        if (v == null) return null;
        return v.setScale(RUB_SCALE, MODE);
    }

    public static BigDecimal divideMoney(BigDecimal a, BigDecimal b) {
        return a.divide(b, MONEY_SCALE, MODE);
    }

    public static BigDecimal divideAmount(BigDecimal a, BigDecimal b, int scale) {
        return a.divide(b, scale, MODE);
    }
}
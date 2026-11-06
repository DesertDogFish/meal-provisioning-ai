package com.provision.service;

import org.junit.jupiter.api.Test;
import java.math.BigDecimal;
import static org.junit.jupiter.api.Assertions.*;

class ShoppingRoundingTest {
    @Test
    void scaleAmount_null() { assertNull(ShoppingRounding.scaleAmount(null)); }
    @Test
    void scaleAmount_halfUp() { assertEquals(new BigDecimal("0.123"), ShoppingRounding.scaleAmount(new BigDecimal("0.123456"))); }
    @Test
    void scaleMoney() { assertEquals(new BigDecimal("1.23"), ShoppingRounding.scaleMoney(new BigDecimal("1.23456"))); }
    @Test
    void roundToRub() { assertEquals(new BigDecimal("2"), ShoppingRounding.roundToRub(new BigDecimal("1.5"))); }
    @Test
    void divideMoney() { assertEquals(new BigDecimal("3.33"), ShoppingRounding.divideMoney(new BigDecimal("10"), new BigDecimal("3"))); }
    @Test
    void divideAmount() { assertEquals(new BigDecimal("3.3333"), ShoppingRounding.divideAmount(new BigDecimal("10"), new BigDecimal("3"), 4)); }
}
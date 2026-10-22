package com.provision.config;

import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.*;

class JwtPropertiesValidationTest {
    @Test
    void blankSecretFailsFast() {
        JwtProperties p = new JwtProperties();
        p.setSecret("");
        assertThatThrownBy(p::validate).isInstanceOf(IllegalStateException.class);
        p.setSecret(null);
        assertThatThrownBy(p::validate).isInstanceOf(IllegalStateException.class);
    }
    @Test
    void shortSecretFailsFast() {
        JwtProperties p = new JwtProperties();
        p.setSecret("short");
        assertThatThrownBy(p::validate).isInstanceOf(IllegalStateException.class)
            .hasMessageContaining("too short");
    }
    @Test
    void longSecretPasses() {
        JwtProperties p = new JwtProperties();
        p.setSecret("test-secret-key-for-jwt-tokens-must-be-at-least-256-bits-long-for-hs256");
        assertThatCode(p::validate).doesNotThrowAnyException();
    }
}

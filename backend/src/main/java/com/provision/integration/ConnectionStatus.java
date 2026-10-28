package com.provision.integration;

public record ConnectionStatus(
    boolean available,
    String message
) {
    public static ConnectionStatus success() {
        return new ConnectionStatus(true, "Connected successfully");
    }

    /** Fix-11 (п.8): успех с пояснением (например, подключение через фолбэк). */
    public static ConnectionStatus success(String message) {
        return new ConnectionStatus(true, message);
    }

    public static ConnectionStatus error(String message) {
        return new ConnectionStatus(false, message);
    }
}

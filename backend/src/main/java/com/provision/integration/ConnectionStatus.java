package com.provision.integration;

public record ConnectionStatus(
    boolean available,
    String message
) {
    public static ConnectionStatus available() {
        return new ConnectionStatus(true, "Connected successfully");
    }
    
    public static ConnectionStatus error(String message) {
        return new ConnectionStatus(false, message);
    }
}

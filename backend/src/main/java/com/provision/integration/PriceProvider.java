package com.provision.integration;

import java.time.LocalDate;
import java.util.List;

public interface PriceProvider {
    String code();
    
    ConnectionStatus testConnection();
    
    List<ExternalProductDto> searchProducts(String query, int limit);
    
    List<ExternalPriceDto> fetchPrices(String externalCode, LocalDate since);
}

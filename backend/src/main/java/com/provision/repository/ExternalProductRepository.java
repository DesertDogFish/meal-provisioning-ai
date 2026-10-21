package com.provision.repository;

import com.provision.entity.ExternalProduct;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface ExternalProductRepository extends JpaRepository<ExternalProduct, Long> {
    Optional<ExternalProduct> findByProviderAndExternalCode(String provider, String externalCode);
    List<ExternalProduct> findByProviderAndNameContainingIgnoreCase(String provider, String name);
}

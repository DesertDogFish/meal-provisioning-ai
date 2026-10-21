package com.provision.repository;

import com.provision.entity.ProductCategory;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface ProductCategoryRepository extends JpaRepository<ProductCategory, Long> {
    List<ProductCategory> findAllByOrderBySortOrderAsc();
    Optional<ProductCategory> findBySlug(String slug);
    Optional<ProductCategory> findByName(String name);
}

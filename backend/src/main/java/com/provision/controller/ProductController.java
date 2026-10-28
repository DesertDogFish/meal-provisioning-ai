package com.provision.controller;

import com.provision.dto.product.*;
import com.provision.entity.UnitOfMeasure;
import com.provision.service.ProductService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequiredArgsConstructor
public class ProductController {

    private final ProductService productService;

    @GetMapping("/api/v1/product-categories")
    public List<ProductCategoryDto> getAllCategories() {
        return productService.getAllCategories();
    }

    @GetMapping("/api/v1/admin/products")
    @PreAuthorize("hasRole('ADMIN')")
    public Page<ProductResponse> getProducts(
            @RequestParam(required = false) String query,
            @RequestParam(required = false) List<Long> categoryId,
            @RequestParam(required = false) List<UnitOfMeasure> unit,
            @RequestParam(required = false) String priceStatus,
            @RequestParam(required = false) String priceSyncStatus,
            @RequestParam(required = false) String usageStatus,
            @RequestParam(required = false, defaultValue = "name") String sort,
            @RequestParam(required = false, defaultValue = "asc") String direction,
            @RequestParam(required = false, defaultValue = "0") int page,
            @RequestParam(required = false, defaultValue = "20") int size
    ) {
        return productService.getProducts(query, categoryId, unit, priceStatus,
                priceSyncStatus, usageStatus, sort, direction, page, size);
    }

    @PostMapping("/api/v1/admin/products")
    @PreAuthorize("hasRole('ADMIN')")
    @ResponseStatus(HttpStatus.CREATED)
    public ProductResponse createProduct(@Valid @RequestBody ProductRequest request) {
        return productService.createProduct(request);
    }

    @PutMapping("/api/v1/admin/products/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    public ProductResponse updateProduct(
            @PathVariable Long id,
            @Valid @RequestBody ProductRequest request
    ) {
        return productService.updateProduct(id, request);
    }

    @DeleteMapping("/api/v1/admin/products/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteProduct(@PathVariable Long id) {
        productService.deleteProduct(id);
    }

    @GetMapping("/api/v1/admin/products/check-name")
    @PreAuthorize("hasRole('ADMIN')")
    public CheckNameResponse checkName(
            @RequestParam String name,
            @RequestParam UnitOfMeasure unit
    ) {
        return productService.checkName(name, unit);
    }
}

package com.provision.exception;

import com.provision.dto.error.ErrorResponse;

import java.util.List;

/**
 * FIX (P1, аудит Phase 11): ConflictException с машиночитаемым кодом PRODUCT_IN_USE
 * и заполненным списком ресурсов, блокирующих операцию. GlobalExceptionHandler
 * кладёт usedIn в поле ErrorResponse.usedIn — фронт показывает список рецептов.
 */
public class ProductInUseConflictException extends ConflictException {

    private final List<ErrorResponse.UsedInResource> usedIn;

    public ProductInUseConflictException(String message, List<ErrorResponse.UsedInResource> usedIn) {
        super(message);
        this.usedIn = usedIn;
    }

    public List<ErrorResponse.UsedInResource> getUsedIn() {
        return usedIn;
    }
}

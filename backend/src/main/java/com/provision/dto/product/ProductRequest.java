package com.provision.dto.product;

import com.provision.entity.UnitOfMeasure;
import jakarta.validation.constraints.*;

import java.math.BigDecimal;

public record ProductRequest(
    @NotBlank @Size(max = 255)
    String name,
    
    @NotNull
    Long categoryId,
    
    @NotNull
    UnitOfMeasure unit,
    
    @DecimalMin(value = "0.0001", inclusive = false)
    BigDecimal packSize,
    
    Boolean roundToPacks,
    
    @DecimalMin("0")
    BigDecimal kcalPer100g,
    
    @DecimalMin(value = "0.01", inclusive = false)
    BigDecimal pieceWeightG,
    
    @Size(max = 1000)
    String description,

    /**
     * Код позиции локального справочника ЕМИСС — «откуда брать цену» (V26).
     * {@code null}/пустая строка = отвязать (цену ведёт человек). Сервис проверяет,
     * что код есть в локальной копии: опечатка не должна молча ломать синхронизацию.
     */
    @Size(max = 16)
    String emisCode
) {}

package com.provision.dto.recipe;

import com.provision.entity.MealType;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;
import java.util.List;

public record RecipeRequest(
    @NotBlank @Size(min = 1, max = 255)
    String name,
    
    @NotNull
    MealType mealType,
    
    @Size(min = 1, max = 40)
    String category,
    
    @Min(0)
    Integer cookMinutes,
    
    @NotNull @Min(1)
    Integer baseServings,
    
    // CR-1: caloriesPerServing deprecated, считается из продуктов
    // @Deprecated
    Integer caloriesPerServing,
    
    @NotEmpty @Valid
    List<RecipeIngredientItem> ingredients
) {
    public record RecipeIngredientItem(
        @NotNull
        Long ingredientId,
        
        @NotNull
        BigDecimal amount
    ) {}
}

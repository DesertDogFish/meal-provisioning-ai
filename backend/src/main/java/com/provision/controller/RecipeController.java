package com.provision.controller;

import com.provision.dto.recipe.RecipeRequest;
import com.provision.dto.recipe.RecipeResponse;
import com.provision.entity.MealType;
import com.provision.service.RecipeService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/v1")
@RequiredArgsConstructor
public class RecipeController {

    private final RecipeService recipeService;

    @GetMapping("/recipes")
    public List<RecipeResponse> getAllRecipes(
            @RequestParam(required = false) MealType mealType,
            @RequestParam(required = false) String category,
            @RequestParam(required = false) Integer cookMinutes,
            @RequestParam(required = false) String search
    ) {
        return recipeService.getRecipesWithFilters(mealType, category, cookMinutes, search);
    }

    @GetMapping("/recipes/{id}")
    public RecipeResponse getRecipe(@PathVariable Long id) {
        return recipeService.getRecipe(id);
    }

    @PostMapping("/admin/recipes")
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize("hasRole('ADMIN')")
    public RecipeResponse createRecipe(@Valid @RequestBody RecipeRequest request) {
        return recipeService.createRecipe(request);
    }

    @PutMapping("/admin/recipes/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    public RecipeResponse updateRecipe(
            @PathVariable Long id,
            @Valid @RequestBody RecipeRequest request
    ) {
        return recipeService.updateRecipe(id, request);
    }

    @DeleteMapping("/admin/recipes/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @PreAuthorize("hasRole('ADMIN')")
    public void deleteRecipe(@PathVariable Long id) {
        recipeService.deleteRecipe(id);
    }
}

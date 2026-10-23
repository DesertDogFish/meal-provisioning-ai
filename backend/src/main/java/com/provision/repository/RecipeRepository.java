package com.provision.repository;

import com.provision.entity.MealType;
import com.provision.entity.Recipe;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface RecipeRepository extends JpaRepository<Recipe, Long> {
    List<Recipe> findByMealType(MealType mealType);
    
    List<Recipe> findByCategory(String category);
    
    List<Recipe> findByCookMinutes(Integer cookMinutes);
    
    @Query("SELECT r FROM Recipe r ORDER BY r.name")
    List<Recipe> findAllOrderByName();
    
    @Query("SELECT r FROM Recipe r LEFT JOIN FETCH r.ingredients ri LEFT JOIN FETCH ri.ingredient WHERE r.id = :id")
    Recipe findByIdWithIngredients(@Param("id") Long id);

    /**
     * FIX P1 («дикая загрузка сервера при открытии похода»): пакетная загрузка
     * рецептов с составом (ingredients + ingredient) одним запросом — для
     * SummaryService, который обходит все блюда похода. При open-in-view:false
     * ленивые recipe.ingredients/ri.ingredient иначе грузятся по одному запросу
     * на каждый рецепт/ингредиент (N+1). Дубли рецептов (раздувание от join)
     * устраняет Hibernate при именованном fetch-join; distinct не используется,
     * т.к. Hibernate не поддерживает DISTINCT + FETCH.
     */
    @Query("SELECT r FROM Recipe r LEFT JOIN FETCH r.ingredients ri LEFT JOIN FETCH ri.ingredient " +
           "WHERE r.id IN :ids")
    List<Recipe> findAllWithIngredientsByIds(@Param("ids") java.util.Collection<Long> ids);
    
    @Query("SELECT r FROM Recipe r LEFT JOIN FETCH r.ingredients ri LEFT JOIN FETCH ri.ingredient ORDER BY r.name")
    List<Recipe> findAllWithIngredients();
    
    // NOTE: DISTINCT здесь нельзя — Hibernate не умеет DISTINCT + FETCH (ошибка кеша Second Level).
    // Дедупликация — в service-слое через LinkedHashSet (поиск по join на ingredients даёт дубли).
    @Query("SELECT r FROM Recipe r LEFT JOIN r.ingredients ri LEFT JOIN ri.ingredient " +
           "WHERE LOWER(r.name) LIKE LOWER(CONCAT('%', :search, '%')) " +
           "OR LOWER(ri.ingredient.name) LIKE LOWER(CONCAT('%', :search, '%')) ORDER BY r.name")
    List<Recipe> searchByNameOrIngredient(@Param("search") String search);
    
    // NOTE: CAST(:search AS string) типизирует параметр — при search == null PostgreSQL
    // иначе выводит lower(bytea) на не типизированном NULL и падает (500).
    @Query("SELECT r FROM Recipe r LEFT JOIN FETCH r.ingredients ri LEFT JOIN FETCH ri.ingredient " +
           "WHERE (:mealType IS NULL OR r.mealType = :mealType) " +
           "AND (:category IS NULL OR r.category = :category) " +
           "AND (:cookMinutes IS NULL OR r.cookMinutes = :cookMinutes) " +
           "AND (CAST(:search AS string) IS NULL OR (" +
           "LOWER(r.name) LIKE LOWER(CONCAT('%', CAST(:search AS string), '%')) " +
           "OR LOWER(ri.ingredient.name) LIKE LOWER(CONCAT('%', CAST(:search AS string), '%')))) " +
           "ORDER BY r.name")
    List<Recipe> findWithFilters(
            @Param("mealType") MealType mealType,
            @Param("category") String category,
            @Param("cookMinutes") Integer cookMinutes,
            @Param("search") String search);
    
    @Query("SELECT COUNT(DISTINCT r) FROM Recipe r " +
           "WHERE (:mealType IS NULL OR r.mealType = :mealType) " +
           "AND (:category IS NULL OR r.category = :category) " +
           "AND (:cookMinutes IS NULL OR r.cookMinutes = :cookMinutes)")
    long countWithFilters(
            @Param("mealType") MealType mealType,
            @Param("category") String category,
            @Param("cookMinutes") Integer cookMinutes);
}

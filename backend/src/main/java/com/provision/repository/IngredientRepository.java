package com.provision.repository;

import com.provision.entity.Ingredient;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface IngredientRepository extends JpaRepository<Ingredient, Long> {
    Optional<Ingredient> findByName(String name);
    boolean existsByName(String name);
    
    @Query("SELECT i FROM Ingredient i WHERE i.category = :category ORDER BY i.name")
    List<Ingredient> findByCategory(String category);
    
    @Query("SELECT i FROM Ingredient i ORDER BY i.name")
    List<Ingredient> findAllOrderByname();
}

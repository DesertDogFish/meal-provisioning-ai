package com.provision.repository;

import com.provision.entity.StagingRecipe;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface StagingRecipeRepository extends JpaRepository<StagingRecipe, Long> {
    List<StagingRecipe> findByStatusOrderByCreatedAtDesc(String status);
    List<StagingRecipe> findAllByOrderByCreatedAtDesc();
}

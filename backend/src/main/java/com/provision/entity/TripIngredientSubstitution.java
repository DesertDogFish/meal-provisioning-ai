package com.provision.entity;

import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import java.time.LocalDateTime;

@Entity
@Table(name = "trip_ingredient_substitutions", uniqueConstraints = {
    @UniqueConstraint(columnNames = {"trip_id", "recipe_id", "from_ingredient_id"})
})
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class TripIngredientSubstitution {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "trip_id", nullable = false)
    private Trip trip;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "recipe_id", nullable = false)
    private Recipe recipe;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "from_ingredient_id", nullable = false)
    private Ingredient fromIngredient;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "to_ingredient_id", nullable = false)
    private Ingredient toIngredient;

    @Column(nullable = false, precision = 10, scale = 4)
    @Builder.Default
    private BigDecimal ratio = BigDecimal.ONE;

    @Column(length = 500)
    private String comment;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "created_by")
    private User createdBy;

    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @PrePersist
    protected void onCreate() {
        createdAt = LocalDateTime.now();
    }
}

package com.provision.entity;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;

@Entity
@Table(name = "ingredient_mappings", uniqueConstraints = {
    @UniqueConstraint(columnNames = {"external_name", "source"})
})
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class IngredientMapping {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "external_name", nullable = false, length = 255)
    private String externalName;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private RecipeSource source;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "internal_ingredient_id", nullable = false)
    private Ingredient internalIngredient;

    @Column(name = "external_code", length = 64)
    private String externalCode;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "external_product_id")
    private ExternalProduct externalProduct;

    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @PrePersist
    protected void onCreate() {
        createdAt = LocalDateTime.now();
    }
}

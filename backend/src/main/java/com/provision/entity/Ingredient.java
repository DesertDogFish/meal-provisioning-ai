package com.provision.entity;

import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import java.time.LocalDateTime;

@Entity
@Table(name = "ingredients")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Ingredient {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(unique = true, length = 64)
    private String code;

    @Column(nullable = false, length = 255)
    private String name;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 10)
    private UnitOfMeasure unit;

    @Column(name = "name_norm", nullable = false, length = 255)
    private String nameNorm;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "category_id", nullable = false)
    private ProductCategory category;

    @Column(name = "kcal_per_100g", precision = 10, scale = 2)
    private BigDecimal kcalPer100g;

    @Column(name = "piece_weight_g", precision = 10, scale = 2)
    private BigDecimal pieceWeightG;

    @Column(name = "pack_size", precision = 14, scale = 3)
    private BigDecimal packSize;

    @Column(name = "round_to_packs", nullable = false)
    @Builder.Default
    private Boolean roundToPacks = false;

    // V20: trip_id NULL = глобальный справочник; иначе копия продукта для похода
    @Column(name = "trip_id")
    private Long tripId;

    // V20: ссылка на исходный продукт справочника (ON DELETE SET NULL на уровне БД)
    @Column(name = "snapshot_of")
    private Long snapshotOf;

    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;

    @PrePersist
    protected void onCreate() {
        createdAt = LocalDateTime.now();
        updatedAt = LocalDateTime.now();
    }

    @PreUpdate
    protected void onUpdate() {
        updatedAt = LocalDateTime.now();
    }
}

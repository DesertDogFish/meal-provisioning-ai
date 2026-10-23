package com.provision.entity;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;

/** Фаза 14: мягкое исключение продукта из расчёта закупки похода (без удаления). */
@Entity
@Table(name = "trip_shopping_exclusions", uniqueConstraints = {
    @UniqueConstraint(columnNames = {"trip_id", "ingredient_id"})
})
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class TripShoppingExclusion {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "trip_id", nullable = false)
    private Trip trip;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "ingredient_id", nullable = false)
    private Ingredient ingredient;

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

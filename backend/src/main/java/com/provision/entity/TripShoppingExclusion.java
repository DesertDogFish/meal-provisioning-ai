package com.provision.entity;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * Фаза 14: мягкое исключение продукта из расчёта закупки похода (без удаления).
 * Fix-5 / R2 (шаг 2): dayDate=null — исключение на весь поход; конкретная дата —
 * только на этот день. Уникальность — partial-индексы V23 (не @UniqueConstraint:
 * пара (trip, ingredient) теперь не уникальна сама по себе).
 */
@Entity
@Table(name = "trip_shopping_exclusions")
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

    /** null = на весь поход; иначе — исключение конкретного дня (Fix-5 / R2 шаг 2). */
    @Column(name = "day_date")
    private LocalDate dayDate;

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

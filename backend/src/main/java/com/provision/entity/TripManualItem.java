package com.provision.entity;

import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * Fix-2 (список 26.10, U40 / PLAN R3): ручная позиция закупки — продукт к дню
 * похода (day != null) или ко всему походу (day == null), вне блюд.
 * Количество — абсолют в единицах продукта (не на порцию).
 *
 * AGENTS §9: ссылка ingredient указывает на trip-scoped копию продукта, если она
 * создана для похода (резолвит TripManualItemService), иначе — на глобальный продукт.
 */
@Entity
@Table(name = "trip_manual_items")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class TripManualItem {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "trip_id", nullable = false)
    private Trip trip;

    /** null = позиция на весь поход. */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "day_id")
    private TripDay day;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "ingredient_id", nullable = false)
    private Ingredient ingredient;

    @Column(nullable = false, precision = 14, scale = 3)
    private BigDecimal amount;

    @Column(length = 255)
    private String note;

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

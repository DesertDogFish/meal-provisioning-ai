package com.provision.entity;

import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * BL-27: серверный факт «сколько реально берём/взяли» по позиции чеклиста похода.
 *
 * <p>Пара ({@code amount}, {@code unit}) — свободный человеческий ввод («300 г»,
 * «2 кг», «3 шт»), а не базовые единицы продукта: именно это значение человек
 * видит и правит в чеклисте и в чеке. Ключ — (trip_id, ingredient_id): факт не
 * привязан к штампу потребности и переживает пересчёт людей/состава.</p>
 *
 * <p>Таблица {@code trip_checklist_actual_qty} (V37). {@code @Version} — под
 * оптимистичную блокировку AU-13/BL-41: полная замена набора идемпотентна, но
 * конкурентная правка обязана ловиться, а не теряться.</p>
 */
@Entity
@Table(name = "trip_checklist_actual_qty",
        uniqueConstraints = @UniqueConstraint(columnNames = {"trip_id", "ingredient_id"}))
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class TripChecklistActualQty {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Version
    private Long version;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "trip_id", nullable = false)
    private Trip trip;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "ingredient_id", nullable = false)
    private Ingredient ingredient;

    @Column(nullable = false, precision = 14, scale = 3)
    private BigDecimal amount;

    /** Человеческая единица ввода: 'г' | 'кг' | 'мл' | 'л' | 'шт' | 'уп'. */
    @Column(nullable = false, length = 16)
    private String unit;

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

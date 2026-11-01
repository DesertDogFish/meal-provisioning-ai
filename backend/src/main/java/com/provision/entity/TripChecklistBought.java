package com.provision.entity;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;

/**
 * KB-15: серверная отметка «взято» в чеклисте похода.
 *
 * Раньше отметки хранились только в localStorage браузера (терялись при смене
 * устройства/очистке кеша). Теперь набор хранится на сервере и синхронизируется
 * идемпотентным PUT всего набора.
 *
 * neededStamp — клиентский штамп версии потребности: если потребность пересчиталась
 * и штамп изменился, старая отметка не совпадает и позиция снова считается невзятой.
 */
@Entity
@Table(name = "trip_checklist_bought")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class TripChecklistBought {
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

    @Column(name = "needed_stamp", nullable = false)
    private Long neededStamp;

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

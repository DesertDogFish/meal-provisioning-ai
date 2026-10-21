package com.provision.entity;

import jakarta.persistence.*;
import lombok.*;

@Entity
@Table(name = "trip_meals")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class TripMeal {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "trip_day_id", nullable = false)
    private TripDay tripDay;

    @Enumerated(EnumType.STRING)
    @Column(name = "meal_type", nullable = false, length = 20)
    private MealType mealType;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "recipe_id", nullable = false)
    private Recipe recipe;

    @Column(name = "people_override")
    private Integer peopleOverride;

    @Column(name = "sort_order", nullable = false)
    private Integer sortOrder;
}

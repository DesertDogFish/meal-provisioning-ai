package com.provision.entity;

public enum RecipeSource {
    MANUAL,
    /** Legacy: Open Food Facts. Провайдер демонтирован (Fix-13), значение
     *  сохранено для существующих строк ingredient_mappings/recipes. */
    OFF,
    /** Росстат (ЕМИСС) — код провайдера "ROSSTAT", см. RosstatEmisProvider.code(). */
    ROSSTAT,
    API,
    AI
}

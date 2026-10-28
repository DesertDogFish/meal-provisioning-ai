package com.provision.entity;

/**
 * Источник рецепта/цены.
 *
 * <p>Значение {@code OFF} (Open Food Facts) удалено вместе с провайдером: импорт рецептов
 * и цен из OFF больше не поддерживается, legacy-строки переведены в {@code MANUAL}
 * миграцией V28. CHECK-ограничения колонок {@code source} сужены там же.</p>
 */
public enum RecipeSource {
    MANUAL,
    /** Росстат (ЕМИСС) — код провайдера "ROSSTAT", см. RosstatEmisProvider.code(). */
    ROSSTAT,
    API,
    AI
}

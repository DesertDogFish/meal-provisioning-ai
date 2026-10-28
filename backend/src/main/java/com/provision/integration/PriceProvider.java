package com.provision.integration;

/**
 * Провайдер внешней интеграции: код и проверка доступности.
 *
 * <p>Раньше контракт включал {@code searchProducts} и {@code fetchPrices} — они обслуживали
 * ручную привязку товара к внешней карточке ({@code ingredient_mappings} +
 * {@code external_products}). Ручная привязка демонтирована: продукт связывается с позицией
 * локальной копии ЕМИСС ({@code ingredients.emis_code}), а данные загружаются целиком через
 * {@link EmisDataSource}. Поиск и цены теперь читаются из нашей БД, не из сети.</p>
 */
public interface PriceProvider {

    /** Код провайдера (= {@code integrations.provider}). */
    String code();

    /** Одна короткая проверка доступности (кнопка «Подключить»). */
    ConnectionStatus testConnection();
}

package com.provision.integration;

import java.util.Optional;

/**
 * Опциональная способность провайдера (fix U11): обновление карточки внешнего
 * продукта — название, бренд, фасовка, фото — по внешнему коду (штрихкоду).
 *
 * {@link com.provision.service.IntegrationService} при синхронизации цен
 * проверяет провайдера через {@code instanceof ProductInfoProvider} и для
 * поддерживающих провайдеров освежает ExternalProduct; изменения попадают
 * в SyncLog.updatedCount. Провайдеры без этой способности просто пропускаются,
 * поэтому интерфейс не добавляется в обязательный контракт {@link PriceProvider}.
 */
public interface ProductInfoProvider {

    /**
     * Свежие данные карточки продукта либо empty, если продукт не найден
     * у провайдера / запрос не удался (graceful degradation — без исключений).
     */
    Optional<ExternalProductDto> fetchProductInfo(String externalCode);
}

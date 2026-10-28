package com.provision.service;

import com.provision.entity.ExternalProduct;
import com.provision.integration.ExternalProductDto;
import com.provision.repository.ExternalProductRepository;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/**
 * Освежение карточки внешнего продукта данными провайдера (fix U11).
 *
 * <p>Fix-16: вынесено из синхронизации цен в отдельный модуль (R9) — «обновить справочные
 * поля карточки» и «записать цены» разные ответственности, хотя в синке они идут подряд.</p>
 *
 * <p>Вызывается из фонового потока синка, где нет открытой БД-сессии, поэтому:</p>
 * <ul>
 *   <li>карточка загружается по id ВНУТРИ короткой транзакции {@code REQUIRES_NEW}
 *       (detached-объекты и ленивые прокси сюда не передаются — иначе
 *       {@code LazyInitializationException: no Session});</li>
 *   <li>пустые значения из ответа провайдера не затирают существующие данные;</li>
 *   <li>сбой не считается ошибкой синхронизации цен: цены уже сохранены, карточка вторична
 *       (исключение перехватывает вызывающий код и пишет warn в лог).</li>
 * </ul>
 */
@Service
@Slf4j
public class ExternalProductCardService {

    private final ExternalProductRepository externalProductRepository;

    public ExternalProductCardService(ExternalProductRepository externalProductRepository) {
        this.externalProductRepository = externalProductRepository;
    }

    /**
     * Обновляет название, бренд, фасовку и фото карточки свежими данными провайдера.
     *
     * @param productId id карточки внешнего продукта (null → ничего не делаем)
     * @param info      данные провайдера; поля без значения сохраняют текущие данные карточки
     * @return 1, если изменено хотя бы одно поле (идёт в {@code SyncLog.updatedCount}), иначе 0
     */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public int refresh(Long productId, ExternalProductDto info) {
        if (productId == null || info == null) {
            return 0;
        }
        ExternalProduct product = externalProductRepository.findById(productId).orElse(null);
        if (product == null) {
            log.warn("External product {} not found — card refresh skipped", productId);
            return 0;
        }

        boolean changed = false;
        if (hasText(info.name()) && !info.name().equals(product.getName())) {
            product.setName(info.name());
            changed = true;
        }
        if (hasText(info.brand()) && !info.brand().equals(product.getBrand())) {
            product.setBrand(info.brand());
            changed = true;
        }
        if (info.packAmount() != null
                && (product.getPackAmount() == null
                    || product.getPackAmount().compareTo(info.packAmount()) != 0)) {
            product.setPackAmount(info.packAmount());
            changed = true;
        }
        if (hasText(info.packUnit()) && !info.packUnit().equals(product.getPackUnit())) {
            product.setPackUnit(info.packUnit());
            changed = true;
        }
        if (hasText(info.imageUrl()) && !info.imageUrl().equals(product.getImageUrl())) {
            product.setImageUrl(info.imageUrl());
            changed = true;
        }

        if (changed) {
            externalProductRepository.save(product);
            log.info("External product {} (code {}) card refreshed from provider data",
                    productId, product.getExternalCode());
        } else {
            log.debug("External product {} card already up to date", productId);
        }
        return changed ? 1 : 0;
    }

    private static boolean hasText(String s) {
        return s != null && !s.isBlank();
    }
}

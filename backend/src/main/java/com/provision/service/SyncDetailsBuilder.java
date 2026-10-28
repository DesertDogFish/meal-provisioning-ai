package com.provision.service;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Сборка {@code SyncLog.details} (jsonb) — «постатейный» отчёт о запуске синхронизации.
 *
 * <p>Fix-15 ввёл детали запуска, потому что журнал показывал голый счётчик «Ошибки: N»
 * без ответа на вопросы «что именно синхронизировалось», «какие цены», «почему ошибка».
 * Fix-16 вынес сборку в отдельный модуль (R9): структура payload'а — самостоятельная
 * ответственность, она обязана совпадать с {@code SyncLogResponse.SyncDetails} и drawer'ом
 * журнала синков, и не должна размываться внутри оркестрации синка цен.</p>
 *
 * <p>Контракт полей (менять только вместе с бэкенд-DTO, mockServer и UI журнала):
 * {@code requestCount}, {@code items[]}, {@code errors[]}, {@code fatalError?}.</p>
 */
public final class SyncDetailsBuilder {

    private SyncDetailsBuilder() {}

    /**
     * Одна строка постатейного отчёта.
     *
     * @param productId   id внутреннего продукта (ингредиента), к которому привязан маппинг
     * @param productName его название — именно его видит админ в drawer'е
     * @param priceDate   дата самой свежей ценовой точки провайдера (null, если точек нет)
     * @param oldPrice    цена до синка (null, если цены на эту дату не было)
     * @param newPrice    цена после синка (null для SKIPPED/SKIPPED_MANUAL/ERROR)
     * @param action      CREATED / UPDATED / SKIPPED / SKIPPED_MANUAL / ERROR
     * @param reason      пояснение: счётчики записи или текст ошибки
     */
    public record Item(Long productId, String productName, String externalCode,
                       LocalDate priceDate, BigDecimal oldPrice, BigDecimal newPrice,
                       String action, String reason) {}

    /** Постатейная строка итога синка. */
    public static Map<String, Object> item(Item it) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("productId", it.productId());
        m.put("productName", it.productName());
        m.put("externalCode", it.externalCode());
        m.put("priceDate", it.priceDate() == null ? null : it.priceDate().toString());
        m.put("oldPrice", it.oldPrice() == null ? null : it.oldPrice().doubleValue());
        m.put("newPrice", it.newPrice() == null ? null : it.newPrice().doubleValue());
        m.put("action", it.action());
        m.put("reason", it.reason());
        // Резерв под будущую проверку аномалий цен (скачки > порога): UI уже понимает флаг.
        m.put("anomaly", false);
        return m;
    }

    /** Запись об ошибке: внешний код (или «—» для фатального сбоя) + человекочитаемый текст. */
    public static Map<String, Object> error(String externalCode, String message) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("externalCode", externalCode);
        m.put("message", message);
        return m;
    }

    /**
     * Итоговый payload {@code SyncLog.details}.
     *
     * @param requestCount число реальных обращений к внешнему источнику (drawer:
     *                     «запросов к источнику: N»; 0 — источник не дёргали вовсе)
     * @param fatalError   текст фатального сбоя (синк не дошёл до цикла маппингов), иначе null
     */
    public static Map<String, Object> details(int requestCount,
                                              List<Map<String, Object>> items,
                                              List<Map<String, Object>> errors,
                                              String fatalError) {
        Map<String, Object> d = new LinkedHashMap<>();
        d.put("requestCount", requestCount);
        d.put("items", items);
        d.put("errors", errors);
        if (fatalError != null) d.put("fatalError", fatalError);
        return d;
    }

    /** Текст ошибки из исключения: message либо имя класса, если message пуст. */
    public static String messageOf(Throwable t) {
        return t.getMessage() == null ? t.getClass().getSimpleName() : t.getMessage();
    }
}

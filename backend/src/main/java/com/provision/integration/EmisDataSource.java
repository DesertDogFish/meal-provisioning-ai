package com.provision.integration;

/**
 * Способность провайдера отдать полный слепок выгрузки ЕМИСС.
 *
 * <p>Отделён от {@link PriceProvider} (проверка доступности) намеренно: загрузка — тяжёлая
 * операция (SDMX-выгрузка на десятки мегабайт), её вызывает только фоновая синхронизация,
 * а не каждый поиск или запрос цены.</p>
 */
public interface EmisDataSource {

    /** Код провайдера (= {@code integrations.provider}, например {@code ROSSTAT}). */
    String code();

    /**
     * Свежая выгрузка с портала. Кэш НЕ используется: смысл кнопки «Синхронизировать» —
     * положить в нашу БД актуальные данные за последние два года.
     *
     * @throws com.provision.exception.IntegrationUnavailableException если портал недоступен,
     *         отклонил набор фильтров или вернул не SDMX
     */
    EmisSnapshot downloadSnapshot();

    /**
     * Разбор выгрузки, которую админ скачал с портала САМ и загрузил файлом
     * («Интеграции → Загрузить файл выгрузки»).
     *
     * <p>Зачем: портал ЕМИСС закрыт анти-ботом и троттлингом, из прода он отвечает не всегда.
     * Файл — тот же SDMX-ответ {@code downloadData.do?format=sdmx}, поэтому путь дальше
     * identical: слепок уходит в локальную копию и применяется к привязанным продуктам.
     * Требование «провайдер подключён» к этому пути НЕ предъявляется: загрузка файла и есть
     * план Б при недоступном портале.</p>
     *
     * @param payload  байты файла (SDMX XML)
     * @param fileName имя файла — для журнала и текстов ошибок
     * @throws com.provision.exception.IntegrationUnavailableException если файл пуст, больше
     *         предела {@code max-response-bytes} или это не SDMX-выгрузка ЕМИСС
     */
    default EmisSnapshot parseSnapshot(byte[] payload, String fileName) {
        throw new com.provision.exception.IntegrationUnavailableException(
                "Провайдер " + code() + " не поддерживает разбор файла выгрузки ЕМИСС");
    }
}

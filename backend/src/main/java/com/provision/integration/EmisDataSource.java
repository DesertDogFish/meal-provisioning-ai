package com.provision.integration;

import java.io.ByteArrayInputStream;
import java.io.InputStream;

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
     * <p><b>Потоковый вариант (внешний аудит 30.10.2026, AU-05).</b> Полный ряд ЕМИСС весит
     * ~65 МБ при лимите загрузки 96 МБ, а {@code spring.servlet.multipart} и так пишет файл на
     * диск. Материализация его в {@code byte[]} означала, что 96 МБ живут в heap всё время
     * фонового синка (и в очереди executor'а), — при {@code mem_limit: 1g} и heap ~700 МБ
     * несколько одновременных загрузок давали OOM. Разбор SDMX уже потоковый (StAX, KB-1),
     * поэтому контракт переведён на {@link InputStream}: вызывающий отдаёт поток и размер,
     * провайдер не накапливает файл в памяти.</p>
     *
     * @param payload   поток с содержимым файла (SDMX XML); {@code null} трактуется как пустой файл.
     *                  Закрывает поток вызывающий.
     * @param sizeBytes declared-размер файла — для проверки предела {@code max-response-bytes}
     *                  ДО чтения (иначе runaway-файл заметили бы только в конце)
     * @param fileName  имя файла — для журнала и текстов ошибок
     * @throws com.provision.exception.IntegrationUnavailableException если файл пуст, больше
     *         предела {@code max-response-bytes} или это не SDMX-выгрузка ЕМИСС
     */
    default EmisSnapshot parseSnapshot(InputStream payload, long sizeBytes, String fileName) {
        throw new com.provision.exception.IntegrationUnavailableException(
                "Провайдер " + code() + " не поддерживает разбор файла выгрузки ЕМИСС");
    }

    /**
     * Удобная обёртка для уже материализованных байт (тесты, небольшие файлы).
     * Делегирует в потоковый вариант, поэтому поведение и тексты ошибок одни и те же.
     *
     * @param payload байты файла либо {@code null}
     */
    default EmisSnapshot parseSnapshot(byte[] payload, String fileName) {
        return parseSnapshot(payload == null ? null : new ByteArrayInputStream(payload),
                payload == null ? 0L : payload.length, fileName);
    }
}

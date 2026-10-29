package com.provision.controller;

import com.provision.dto.integration.IntegrationDto;
import com.provision.dto.integration.SyncLogDto;
import com.provision.entity.User;
import com.provision.exception.ValidationException;
import com.provision.service.IntegrationService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.List;
import java.util.Map;

/**
 * Раздел «Интеграции»: карточка провайдера, подключение/отключение, запуск синхронизации,
 * загрузка выгрузки ЕМИСС файлом и журнал.
 *
 * <p>Ручной привязки товаров здесь больше нет (демонтирована): продукт связывается с позицией
 * локальной копии ЕМИСС в разделе «Продукты» — см. {@link EmisController} и
 * {@code PUT /admin/products/{id}} с полем {@code emisCode}.</p>
 */
@RestController
@RequestMapping("/api/v1/admin/integrations")
@RequiredArgsConstructor
@PreAuthorize("hasRole('ADMIN')")
public class IntegrationController {

    private final IntegrationService integrationService;

    @GetMapping
    public List<IntegrationDto> getAllIntegrations() {
        return integrationService.getAllIntegrations();
    }

    @PostMapping("/{provider}/connect")
    public IntegrationDto connect(@PathVariable String provider) {
        return integrationService.connect(provider);
    }

    @PostMapping("/{provider}/disconnect")
    public IntegrationDto disconnect(@PathVariable String provider) {
        return integrationService.disconnect(provider);
    }

    /**
     * Синхронизация = скачать выгрузку ЕМИСС, положить в локальную копию данные за два
     * последних года и применить цены к привязанным продуктам. Ответ 202 + logId:
     * работа фоновая, прогресс и итог — в {@code GET /admin/integrations/sync-logs}.
     */
    @PostMapping("/{provider}/sync/prices")
    public ResponseEntity<Map<String, Long>> syncPrices(
            @PathVariable String provider,
            @AuthenticationPrincipal User user) {
        var syncLog = integrationService.syncPrices(provider, user.getId());
        return ResponseEntity.status(HttpStatus.ACCEPTED)
                .body(Map.of("logId", syncLog.getId()));
    }

    /**
     * Загрузка выгрузки ЕМИСС файлом (Запуск №17): админ скачивает SDMX с портала сам и
     * кладёт его в локальную копию. Ответ 202 + logId — работа фоновая, итог виден в
     * {@code GET /admin/integrations/sync-logs} (в деталях запуска будет
     * {@code mirror.snapshotSource = «файл <имя>»}).
     *
     * <p>Подключение провайдера не требуется: это рабочий путь при недоступном портале.
     * Размер файла ограничен {@code integration.rosstat.max-response-bytes} (проверяет
     * провайдер) и лимитами {@code spring.servlet.multipart}.</p>
     *
     * <p><b>AU-05 (внешний аудит 30.10.2026).</b> Два изменения против прежней версии:</p>
     * <ol>
     *   <li>guard «провайдер существует и синк не бежит» вызывается ДО чтения тела
     *       ({@code assertUploadCanStart}). Раньше {@code file.getBytes()} материализовывал
     *       все 96 МБ в heap и только потом выяснялось, что ответ всё равно 409;</li>
     *   <li>содержимое копируется во временный файл потоком, а не в {@code byte[]}, и дальше
     *       по конвейеру идёт {@link Path}. Heap от размера файла больше не зависит —
     *       разбор SDMX потоковый (StAX, KB-1).</li>
     * </ol>
     *
     * <p>Временный файл удаляет тот, кто им владеет: после успешного старта —
     * {@code PriceSyncService.runPriceSyncFromFile} в {@code finally}, при отказе старта —
     * {@code IntegrationService.uploadSnapshot} либо catch ниже.</p>
     */
    @PostMapping("/{provider}/upload")
    public ResponseEntity<Map<String, Long>> uploadSnapshot(
            @PathVariable String provider,
            @RequestParam("file") MultipartFile file,
            @AuthenticationPrincipal User user) {
        // 1) Отказ, не требующий чтения тела, — до того, как файл попадёт на диск.
        integrationService.assertUploadCanStart(provider);

        // 2) Копируем на диск потоком. Files.copy (а не transferTo) — намеренно:
        //    у StandardMultipartFile.transferTo семантика rename поверх существующего файла
        //    зависит от контейнера, а REPLACE_EXISTING однозначен.
        Path temp;
        try {
            temp = Files.createTempFile("emis-upload-", ".sdmx");
            try (InputStream in = file.getInputStream()) {
                Files.copy(in, temp, StandardCopyOption.REPLACE_EXISTING);
            }
        } catch (IOException e) {
            throw new ValidationException("FILE_READ_ERROR: Не удалось прочитать файл выгрузки: "
                    + e.getMessage());
        }

        // 3) Старт синка. Если он не состоялся — файл не должен остаться на диске.
        try {
            var syncLog = integrationService.uploadSnapshot(
                    provider, user.getId(), temp, file.getSize(), file.getOriginalFilename());
            return ResponseEntity.status(HttpStatus.ACCEPTED)
                    .body(Map.of("logId", syncLog.getId()));
        } catch (RuntimeException e) {
            deleteQuietly(temp);
            throw e;
        }
    }

    /** Удалить временный файл при отказе; причина отказа уже в ответе и в логе сервиса. */
    private static void deleteQuietly(Path temp) {
        try {
            Files.deleteIfExists(temp);
        } catch (IOException | RuntimeException e) {
            org.slf4j.LoggerFactory.getLogger(IntegrationController.class)
                    .warn("Не удалось удалить временный файл выгрузки {}: {}", temp, e.getMessage());
        }
    }

    @GetMapping("/sync-logs")
    public List<SyncLogDto> getSyncLogs(@RequestParam(required = false) String provider) {
        return integrationService.getSyncLogs(provider);
    }
}

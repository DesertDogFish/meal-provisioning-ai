package com.provision.service;

import com.provision.entity.SyncLog;
import com.provision.exception.IntegrationUnavailableException;
import com.provision.integration.EmisDataSource;
import com.provision.integration.EmisSnapshot;
import com.provision.repository.IntegrationRepository;
import com.provision.repository.SyncLogRepository;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.api.io.TempDir;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.atomic.AtomicLong;
import java.util.concurrent.atomic.AtomicReference;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * AU-05 (внешний аудит 30.10.2026): временный файл загрузки выгрузки ЕМИСС.
 *
 * <p>Проверяются два новых свойства пути «админ грузит файл сам», которые байтовая версия
 * не имела и которые нельзя увидеть в интеграционном тесте без 65 МБ на диске:</p>
 * <ol>
 *   <li><b>Файл не копируется в heap.</b> Провайдер получает {@link InputStream} и declared-размер
 *       (= {@code Files.size}), а не {@code byte[]}; прежняя версия держала все 65 МБ в памяти
 *       всё время фонового синка и ещё в очереди executor'а (heap контейнера ~700 МБ → OOM
 *       на второй одновременной загрузке);</li>
 *   <li><b>Временный файл не переживает синк.</b> Удаляет его {@code runPriceSyncFromFile}
 *       в {@code finally} — и на успехе, и на отказе разбора, и когда запись журнала исчезла.</li>
 * </ol>
 *
 * <p>Слой — сервис (R2): источник данных, зеркало и применение цен — моки, проверяется
 * оркестрация и владение файлом, а не разбор SDMX (он покрыт {@code RosstatEmisProviderTest}).</p>
 */
@ExtendWith(MockitoExtension.class)
@DisplayName("PriceSyncService: файл загрузки читается потоком и удаляется в finally (AU-05)")
class PriceSyncPayloadTest {

    private static final String PROVIDER = "ROSSTAT";
    private static final long SYNC_LOG_ID = 42L;
    private static final String FILE_NAME = "data-31448.xml";
    private static final String PAYLOAD = "<?xml version=\"1.0\"?><GenericData/>";

    @Mock
    private EmisDataSource source;
    @Mock
    private EmisMirrorService mirrorService;
    @Mock
    private EmisCatalogService catalogService;
    @Mock
    private EmisPriceApplier priceApplier;
    @Mock
    private SyncLogRepository syncLogRepository;
    @Mock
    private IntegrationRepository integrationRepository;

    @TempDir
    Path tempDir;

    /** Сервис через конструктор для unit-тестов: self() == this, транзакций и метрик нет. */
    private PriceSyncService service() {
        when(source.code()).thenReturn(PROVIDER);
        return new PriceSyncService(List.of(source), mirrorService, catalogService, priceApplier,
                syncLogRepository, integrationRepository, 2);
    }

    private Path payload() throws IOException {
        Path file = tempDir.resolve(FILE_NAME);
        Files.writeString(file, PAYLOAD, StandardCharsets.UTF_8);
        return file;
    }

    private static SyncLog runningLog() {
        return SyncLog.builder()
                .id(SYNC_LOG_ID)
                .provider(PROVIDER)
                .type("PRICES")
                .status("RUNNING")
                .triggeredBy("MANUAL")
                .build();
    }

    @Test
    @DisplayName("успех: провайдеру отдан поток и declared-размер = Files.size, файл удалён, журнал SUCCESS")
    void passesStreamWithDeclaredSizeAndDeletesPayload() throws IOException {
        Path file = payload();
        long sizeOnDisk = Files.size(file);
        when(syncLogRepository.findById(SYNC_LOG_ID)).thenReturn(Optional.of(runningLog()));
        when(mirrorService.store(any(EmisSnapshot.class), any(), eq(2)))
                .thenReturn(new EmisMirrorService.MirrorOutcome("05", 12, 340, 340, 0, 0, 2025, 2026));
        when(priceApplier.loadLinkedProducts()).thenReturn(List.of());

        AtomicReference<byte[]> received = new AtomicReference<>();
        AtomicLong declaredSize = new AtomicLong(-1L);
        when(source.parseSnapshot(any(InputStream.class), anyLong(), eq(FILE_NAME)))
                .thenAnswer(inv -> {
                    declaredSize.set(inv.getArgument(1));
                    try (InputStream in = inv.getArgument(0)) {
                        received.set(in.readAllBytes());
                    }
                    return new EmisSnapshot(Instant.now(), "05", new LinkedHashMap<>(), Map.of());
                });

        service().runPriceSyncFromFile(PROVIDER, SYNC_LOG_ID, file, FILE_NAME);

        // Контракт AU-05: содержимое пришло потоком (не byte[]), а размер — declared, как у файла.
        assertThat(new String(received.get(), StandardCharsets.UTF_8)).isEqualTo(PAYLOAD);
        assertThat(declaredSize).hasValue(sizeOnDisk);
        assertThat(file).doesNotExist();

        ArgumentCaptor<SyncLog> saved = ArgumentCaptor.forClass(SyncLog.class);
        verify(syncLogRepository).save(saved.capture());
        assertThat(saved.getValue().getStatus()).isEqualTo("SUCCESS");
    }

    @Test
    @DisplayName("отказ разбора: файл всё равно удалён, журнал FAILED с причиной (а не висящий RUNNING)")
    void deletesPayloadWhenParsingFails() throws IOException {
        Path file = payload();
        when(syncLogRepository.findById(SYNC_LOG_ID)).thenReturn(Optional.of(runningLog()));
        when(source.parseSnapshot(any(InputStream.class), anyLong(), eq(FILE_NAME)))
                .thenThrow(new IntegrationUnavailableException(
                        "ЕМИСС: файл «" + FILE_NAME + "» не похож на SDMX-выгрузку"));

        service().runPriceSyncFromFile(PROVIDER, SYNC_LOG_ID, file, FILE_NAME);

        assertThat(file).doesNotExist();
        ArgumentCaptor<SyncLog> saved = ArgumentCaptor.forClass(SyncLog.class);
        verify(syncLogRepository).save(saved.capture());
        assertThat(saved.getValue().getStatus()).isEqualTo("FAILED");
        assertThat(saved.getValue().getDetails())
                .containsEntry("fatalError", "ЕМИСС: файл «" + FILE_NAME + "» не похож на SDMX-выгрузку");
    }

    @Test
    @DisplayName("запись журнала исчезла до старта: синк не начинается, но файл не остаётся на диске")
    void deletesPayloadWhenSyncLogVanished() throws IOException {
        Path file = payload();
        when(syncLogRepository.findById(SYNC_LOG_ID)).thenReturn(Optional.empty());

        service().runPriceSyncFromFile(PROVIDER, SYNC_LOG_ID, file, FILE_NAME);

        assertThat(file).doesNotExist();
        verify(source, never()).parseSnapshot(any(InputStream.class), anyLong(), any());
        verify(syncLogRepository, never()).save(any(SyncLog.class));
    }
}
